import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";
import { admin } from "@/lib/firebase/admin";
import { type Statement } from "@/domain/statements";
import { client, googleToken } from "./helpers";

describe("Bảng kê qua HTTP + Firestore transactions", () => {
  let a: Awaited<ReturnType<typeof client>>,
    b: Awaited<ReturnType<typeof client>>,
    uid: string,
    studentId: string;
  beforeEach(async () => {
    a = await client();
    b = await client();
    const ta = await googleToken(),
      tb = await googleToken();
    uid = ta.uid;
    await a.login(ta.idToken);
    await b.login(tb.idToken);
    studentId = (
      await (
        await a.call("/api/students", "POST", {
          displayName: "Lan",
          defaultRateVnd: 200000,
          privateNote: "Không đưa lên bảng kê",
          phone: "0000000000",
        })
      ).json()
    ).id;
  });
  const root = () => admin().db.doc(`apps/chotcong/users/${uid}`);
  async function sessions(count = 8, day = "2026-10-15") {
    const ids: string[] = [];
    const batch = admin().db.batch();
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      ids.push(id);
      batch.create(root().collection("sessions").doc(id), {
        studentId,
        studentName: "Lan",
        sessionDate: day,
        startTime: null,
        durationMinutes: null,
        status: "completed",
        billable: true,
        rateVnd: 200000,
        amountVnd: 200000,
        privateNote: "Ghi chú buổi riêng",
        billedStatementId: null,
        requestId: randomUUID(),
        schemaVersion: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
    await batch.commit();
    return ids;
  }
  const payload = (ids: string[]) => ({
    studentId,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    dueDate: "2026-11-07",
    sessionIds: ids,
    includeBankDetails: false,
  });
  async function draft(ids: string[]) {
    const response = await a.call("/api/statements", "POST", payload(ids));
    expect(response.status).toBe(200);
    return (await response.json()).id as string;
  }
  async function get(id: string): Promise<Statement> {
    const response = await a.call(`/api/statements/${id}`);
    expect(response.status).toBe(200);
    return response.json();
  }
  async function issue(id: string) {
    const current = await get(id);
    return a.call(`/api/statements/${id}/issue`, "POST", {
      version: current.version,
    });
  }
  it("8 buổi tạo đúng 1.600.000đ, lọc cả hai đầu ngày, không lấy hủy/miễn phí/dự kiến/đã liên kết", async () => {
    const ids = await sessions();
    const before = await sessions(1, "2026-09-30"),
      end = await sessions(1, "2026-10-31"),
      after = await sessions(1, "2026-11-01");
    const excluded = await sessions(4);
    await root()
      .collection("sessions")
      .doc(excluded[0])
      .update({ status: "cancelled", billable: false, amountVnd: 0 });
    await root()
      .collection("sessions")
      .doc(excluded[1])
      .update({ billable: false, amountVnd: 0 });
    await root()
      .collection("sessions")
      .doc(excluded[2])
      .update({ status: "planned", amountVnd: 0 });
    await root()
      .collection("sessions")
      .doc(excluded[3])
      .update({ billedStatementId: "already-issued" });
    const query = new URLSearchParams({
      studentId,
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      limit: "3",
    });
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      if (cursor) query.set("cursor", cursor);
      const page = await (
        await a.call(`/api/statements/eligible?${query}`)
      ).json();
      seen.push(...page.items.map((item: { id: string }) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen)).toEqual(new Set([...ids, ...end]));
    expect(seen).not.toContain(before[0]);
    expect(seen).not.toContain(after[0]);
    const id = await draft(ids);
    const current = await get(id);
    expect(current.totalVnd).toBe(1600000);
    expect(current.items).toHaveLength(8);
    expect(JSON.stringify(current)).not.toContain("Ghi chú buổi riêng");
    expect(JSON.stringify(current)).not.toContain("0000000000");
    const summary = await (await a.call("/api/summary")).json();
    expect(summary.unbilledCount).toBe(11);
  });
  it("nháp sửa được, bản đã phát hành chốt snapshot và khóa buổi; retry không tăng số/audit", async () => {
    await a.call("/api/profile", "PATCH", {
      displayName: "Cô Mai",
      bankDetails: "Ngân hàng mẫu 123",
    });
    const ids = await sessions();
    const id = await draft(ids);
    const update = await a.call(`/api/statements/${id}`, "PATCH", {
      ...payload(ids),
      version: 1,
      includeBankDetails: true,
    });
    expect(update.status).toBe(200);
    expect(
      (
        await a.call(`/api/statements/${id}`, "PATCH", {
          ...payload(ids),
          version: 1,
        })
      ).status,
    ).toBe(409);
    const key = randomUUID();
    const input = { version: 2 };
    expect(
      (await a.call(`/api/statements/${id}/issue`, "POST", input, key)).status,
    ).toBe(200);
    expect(
      (await a.call(`/api/statements/${id}/issue`, "POST", input, key)).status,
    ).toBe(200);
    expect(
      (await a.call(`/api/statements/${id}/issue`, "POST", { version: 3 }, key))
        .status,
    ).toBe(409);
    const issued = await get(id);
    expect(issued.number).toMatch(/^CC-\d{4}-000001$/);
    expect(issued.bankSnapshot).toBe("Ngân hàng mẫu 123");
    await a.call(`/api/students/${studentId}`, "PATCH", {
      displayName: "Tên mới",
      defaultRateVnd: 250000,
    });
    await a.call("/api/profile", "PATCH", {
      displayName: "Tên lớp mới",
      bankDetails: "Thông tin mới",
    });
    const frozen = await get(id);
    expect(frozen.teacherSnapshot.displayName).toBe("Cô Mai");
    expect(frozen.recipientSnapshot.displayName).toBe("Lan");
    expect(frozen.totalVnd).toBe(1600000);
    expect(frozen.bankSnapshot).toBe("Ngân hàng mẫu 123");
    expect(
      (
        await a.call(`/api/sessions/${ids[0]}`, "PATCH", {
          studentId,
          sessionDate: "2026-10-16",
          status: "completed",
          billable: true,
          rateVnd: 250000,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await a.call(`/api/statements/${id}`, "PATCH", {
          ...payload(ids),
          version: issued.version,
        })
      ).status,
    ).toBe(409);
    const audits = await root()
      .collection("auditEvents")
      .where("action", "==", "issued")
      .get();
    expect(audits.size).toBe(1);
    expect(
      (
        await root()
          .collection("counters")
          .doc(issued.issueDate!.slice(0, 4))
          .get()
      ).get("lastValue"),
    ).toBe(1);
    expect((await (await a.call("/api/summary")).json()).unbilledCount).toBe(0);
  });
  it("hai bảng kê cạnh tranh cùng buổi: đúng một phát hành, không cập nhật dở hoặc nhảy counter", async () => {
    const ids = await sessions();
    const first = await draft(ids),
      second = await draft(ids);
    const responses = await Promise.all([issue(first), issue(second)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const [one, two] = await Promise.all([get(first), get(second)]);
    const winner = one.status === "issued" ? one : two;
    expect([one.status, two.status].sort()).toEqual(["draft", "issued"]);
    const docs = await root().collection("sessions").get();
    expect(
      docs.docs.every((doc) => doc.get("billedStatementId") === winner.id),
    ).toBe(true);
    expect(
      (
        await root()
          .collection("counters")
          .doc(winner.issueDate!.slice(0, 4))
          .get()
      ).get("lastValue"),
    ).toBe(1);
  });
  it("sửa buổi đồng thời phát hành không vượt qua khóa và không chốt giá cũ sau sửa", async () => {
    const ids = await sessions(1);
    const id = await draft(ids);
    const [issued, edited] = await Promise.all([
      issue(id),
      a.call(`/api/sessions/${ids[0]}`, "PATCH", {
        studentId,
        sessionDate: "2026-10-15",
        status: "completed",
        billable: true,
        rateVnd: 250000,
      }),
    ]);
    expect([issued.status, edited.status].sort()).toEqual([200, 409]);
    const statement = await get(id);
    const session = await (await a.call(`/api/sessions/${ids[0]}`)).json();
    if (statement.status === "issued") {
      expect(session.rateVnd).toBe(200000);
      expect(session.billedStatementId).toBe(id);
    } else {
      expect(session.rateVnd).toBe(250000);
      expect(session.billedStatementId).toBeNull();
    }
  });
  it("phát hành từ chối nháp cũ khi giá/ngày/tên thay đổi và yêu cầu lưu lại", async () => {
    const ids = await sessions(1);
    const id = await draft(ids);
    await a.call(`/api/sessions/${ids[0]}`, "PATCH", {
      studentId,
      sessionDate: "2026-10-15",
      status: "completed",
      billable: true,
      rateVnd: 250000,
    });
    expect((await issue(id)).status).toBe(409);
    expect((await get(id)).status).toBe("draft");
    expect(
      (
        await a.call(`/api/statements/${id}`, "PATCH", {
          ...payload(ids),
          version: 1,
        })
      ).status,
    ).toBe(200);
    expect((await issue(id)).status).toBe(200);
    expect((await get(id)).totalVnd).toBe(250000);
  });
  it("chặn đọc/ghi/liên kết chéo UID và không tin các trường tiền/snapshot client", async () => {
    const ids = await sessions(1);
    const id = await draft(ids);
    expect((await b.call(`/api/statements/${id}`)).status).toBe(404);
    expect(
      (await b.call(`/api/statements/${id}/issue`, "POST", { version: 1 }))
        .status,
    ).toBe(404);
    expect((await b.call("/api/statements", "POST", payload(ids))).status).toBe(
      404,
    );
    expect(
      (
        await a.call("/api/statements", "POST", {
          ...payload(ids),
          totalVnd: 1,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await a.call(`/api/statements/${id}/issue`, "POST", {
          version: 1,
          teacherSnapshot: { displayName: "Giả" },
        })
      ).status,
    ).toBe(400);
    const other = (
      await (
        await a.call("/api/students", "POST", {
          displayName: "Khác",
          defaultRateVnd: 1,
        })
      ).json()
    ).id;
    expect(
      (
        await a.call("/api/statements", "POST", {
          ...payload(ids),
          studentId: other,
        })
      ).status,
    ).toBe(400);
    expect((await get(id)).status).toBe("draft");
  });
  it("100 buổi hợp lệ, 101/trùng bị chặn; học viên lưu trữ vẫn được đối chiếu", async () => {
    const ids = await sessions(101);
    expect((await a.call("/api/statements", "POST", payload(ids))).status).toBe(
      400,
    );
    expect(
      (await a.call("/api/statements", "POST", payload([ids[0], ids[0]])))
        .status,
    ).toBe(400);
    await a.call(`/api/students/${studentId}/archive`, "POST", {
      archived: true,
    });
    const id = await draft(ids.slice(0, 100));
    expect((await issue(id)).status).toBe(200);
    expect((await get(id)).totalVnd).toBe(20000000);
  });
  it("hủy có lý do, chặn khoản thu hợp lệ, giải phóng buổi + thu hồi token atomically và retry an toàn", async () => {
    const ids = await sessions(2);
    const id = await draft(ids);
    expect((await issue(id)).status).toBe(200);
    const statementRef = root().collection("statements").doc(id);
    await statementRef.update({ paidVnd: 1, activePaymentCount: 1 });
    expect(
      (
        await a.call(`/api/statements/${id}/void`, "POST", {
          version: 2,
          reason: "Sửa kỳ học",
        })
      ).status,
    ).toBe(409);
    await statementRef.update({ paidVnd: 0, activePaymentCount: 1 });
    expect(
      (
        await a.call(`/api/statements/${id}/void`, "POST", {
          version: 2,
          reason: "Sửa kỳ học",
        })
      ).status,
    ).toBe(409);
    const hash = "a".repeat(64);
    const tokenRef = admin().db.doc(`apps/chotcong/shareTokens/${hash}`);
    await tokenRef.set({ ownerUid: uid, statementId: id, revokedAt: null });
    await statementRef.update({
      activePaymentCount: 0,
      activeShareTokenHash: hash,
    });
    const key = randomUUID();
    const body = { version: 2, reason: "Sửa kỳ học" };
    expect(
      (await a.call(`/api/statements/${id}/void`, "POST", body, key)).status,
    ).toBe(200);
    expect(
      (await a.call(`/api/statements/${id}/void`, "POST", body, key)).status,
    ).toBe(200);
    const cancelled = await get(id);
    expect(cancelled.status).toBe("void");
    expect(cancelled.voidReason).toBe("Sửa kỳ học");
    expect(cancelled.activeShareTokenHash).toBeNull();
    expect((await tokenRef.get()).get("revokedAt")).toBeInstanceOf(Timestamp);
    expect(
      (await root().collection("sessions").get()).docs.every(
        (doc) => doc.get("billedStatementId") === null,
      ),
    ).toBe(true);
    const replacement = await draft(ids);
    expect((await issue(replacement)).status).toBe(200);
    expect((await get(replacement)).number).toMatch(/000002$/);
  });
});
