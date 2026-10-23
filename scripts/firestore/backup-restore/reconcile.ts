import { createHash } from "node:crypto";
import {
  profileDocumentSchema,
  studentDocumentSchema,
  sessionDocumentSchema,
  statementDocumentSchema,
  paymentDocumentSchema,
} from "@/domain/firestore";
import { MAX_ACTIVE_PAYMENTS } from "@/domain/payments";
import { sessionAmount } from "@/domain";
import { statementTotal } from "@/domain/statements";
export type RecordData = { path: string; data: FirebaseFirestore.DocumentData };
export const uidHash = (uid: string) =>
  createHash("sha256").update(uid).digest("hex");
export function reconcile(records: RecordData[]) {
  const byPath = new Map(records.map((r) => [r.path, r.data]));
  const paymentGroups = new Map<string, RecordData[]>(),
    numbers = new Set<string>();
  for (const r of records) {
    const p = r.path.split("/");
    if (
      p[2] === "users" &&
      p[4] === "payments" &&
      p.length === 6 &&
      !r.data.voidedAt
    ) {
      const key = `${p.slice(0, 4).join("/")}/statements/${r.data.statementId}`;
      paymentGroups.set(key, [...(paymentGroups.get(key) ?? []), r]);
    }
  }
  let issued = 0,
    totalVnd = 0,
    paidVnd = 0,
    unbilledVnd = 0;
  const fail = () => {
    throw new Error("Financial reconciliation failed; keep maintenance active");
  };
  const checkedAdd = (a: number, b: number) => {
    const n = a + b;
    if (!Number.isSafeInteger(n)) fail();
    return n;
  };
  for (const { path, data } of records) {
    const p = path.split("/");
    if (p[2] !== "users") continue;
    const root = p.slice(0, 4).join("/");
    if (p.length === 4) profileDocumentSchema.parse(data);
    if (p.length !== 6) continue;
    if (!byPath.has(root)) fail();
    if (p[4] === "students") studentDocumentSchema.parse(data);
    if (p[4] === "sessions") {
      const session = sessionDocumentSchema.parse(data);
      if (
        !byPath.has(`${root}/students/${session.studentId}`) ||
        session.amountVnd !== sessionAmount(session)
      )
        fail();
      if (session.billedStatementId) {
        const statement = byPath.get(
          `${root}/statements/${session.billedStatementId}`,
        );
        if (
          statement?.status !== "issued" ||
          !statement.items.some(
            (item: { sessionId: string }) => item.sessionId === p[5],
          )
        )
          fail();
      } else if (session.status === "completed" && session.billable)
        unbilledVnd = checkedAdd(unbilledVnd, session.rateVnd);
    }
    if (p[4] === "payments") {
      const payment = paymentDocumentSchema.parse(data),
        statement = byPath.get(`${root}/statements/${payment.statementId}`);
      if (
        !statement ||
        statement.studentId !== payment.studentId ||
        (!payment.voidedAt && statement.status !== "issued")
      )
        fail();
    }
    if (p[4] !== "statements") continue;
    const statement = statementDocumentSchema.parse(data);
    if (
      statement.totalVnd !== statementTotal(statement.items) ||
      new Set(statement.items.map((i) => i.sessionId)).size !==
        statement.items.length ||
      statement.paidVnd > statement.totalVnd ||
      !byPath.has(`${root}/students/${statement.studentId}`)
    )
      fail();
    const payments = paymentGroups.get(path) ?? [];
    const paid = payments.reduce(
      (n, payment) => checkedAdd(n, payment.data.amountVnd),
      0,
    );
    if (
      payments.length > MAX_ACTIVE_PAYMENTS ||
      paid !== statement.paidVnd ||
      payments.length !== statement.activePaymentCount
    )
      fail();
    if (
      statement.status === "draft" &&
      (statement.number !== null || paid !== 0)
    )
      fail();
    if (statement.status === "void" && paid !== 0) fail();
    if (statement.status !== "draft") {
      const uniqueNumber = `${root}/${statement.number}`;
      if (numbers.has(uniqueNumber)) fail();
      numbers.add(uniqueNumber);
      const number = /^CC-(\d{4})-(\d{6,10})$/.exec(statement.number ?? "");
      const counter = number
        ? byPath.get(`${root}/counters/${number[1]}`)
        : null;
      if (
        !number ||
        !Number.isSafeInteger(counter?.lastValue) ||
        counter?.schemaVersion !== 1 ||
        !(
          byPath.get(`${root}/counters/${number[1]}`)?.lastValue >=
          Number(number[2])
        )
      )
        fail();
    }
    if (statement.status !== "issued") continue;
    if (statement.totalVnd <= 0 || !statement.issuedAt || !statement.issueDate)
      fail();
    issued++;
    for (const item of statement.items) {
      const session = byPath.get(`${root}/sessions/${item.sessionId}`);
      if (
        !session ||
        session.billedStatementId !== p[5] ||
        session.studentId !== statement.studentId ||
        session.status !== "completed" ||
        !session.billable ||
        session.sessionDate !== item.sessionDate ||
        session.rateVnd !== item.amountVnd
      )
        fail();
    }
    totalVnd = checkedAdd(totalVnd, statement.totalVnd);
    paidVnd = checkedAdd(paidVnd, statement.paidVnd);
  }
  return {
    issued,
    totalVnd,
    paidVnd,
    outstandingVnd: totalVnd - paidVnd,
    unbilledVnd,
  };
}
