import "server-only";
import { randomUUID } from "node:crypto";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { idSchema, vietnamToday } from "@/domain";
import {
  MAX_ACTIVE_PAYMENTS,
  paymentInputSchema,
  paymentSchema,
  paymentVoidInputSchema,
} from "@/domain/payments";
import { paymentDocumentSchema } from "@/domain/firestore";
import {
  statementMoneySchema,
  statementVersionSchema,
} from "@/domain/statements";
import { AppError } from "./errors";
import { decode, dto, encode, operation, userRef } from "./repository";
import { getStatement, statementDto } from "./statements-repository";
export const paymentDto = (doc: FirebaseFirestore.DocumentSnapshot) => {
  if (doc.exists) paymentDocumentSchema.parse(doc.data());
  return paymentSchema.parse(dto(doc));
};
function audit(
  tx: FirebaseFirestore.Transaction,
  root: FirebaseFirestore.DocumentReference,
  id: string,
  paymentId: string,
  action: string,
  now: Timestamp,
) {
  tx.create(root.collection("auditEvents").doc(id), {
    entityType: "payment",
    entityId: paymentId,
    action,
    safeMetadata: {},
    createdAt: now,
    schemaVersion: 1,
  });
}
export async function recordPayment(
  uid: string,
  statementId: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(statementId);
  const input = paymentInputSchema.parse(raw);
  const paymentId = randomUUID(),
    eventId = randomUUID();
  return operation(
    uid,
    "payment-create",
    requestId,
    { statementId, ...input },
    async (tx, root, now) => {
      const ref = root.collection("statements").doc(statementId);
      const statement = statementDto(await tx.get(ref));
      if (statement.status !== "issued")
        throw new AppError(409, "Chỉ ghi nhận tiền cho bảng kê đã phát hành.");
      if (input.receivedDate > vietnamToday(now.toDate()))
        throw new AppError(
          400,
          "Ngày nhận tiền không được nằm trong tương lai.",
        );
      if (input.amountVnd > statement.totalVnd - statement.paidVnd)
        throw new AppError(
          409,
          "Số tiền vượt khoản còn phải thu. Hãy tải lại bảng kê để đối chiếu.",
        );
      if (statement.activePaymentCount >= MAX_ACTIVE_PAYMENTS)
        throw new AppError(
          409,
          "Bản thử nghiệm hỗ trợ tối đa 100 khoản thu hợp lệ cho một bảng kê.",
        );
      const data = {
        ...input,
        statementId,
        studentId: statement.studentId,
        recordedAt: now,
        voidedAt: null,
        voidReason: null,
        requestId,
        schemaVersion: 1,
      };
      paymentDocumentSchema.parse(data);
      tx.create(root.collection("payments").doc(paymentId), data);
      tx.update(ref, {
        paidVnd: statementMoneySchema.parse(
          statement.paidVnd + input.amountVnd,
        ),
        activePaymentCount: statement.activePaymentCount + 1,
        version: statementVersionSchema.parse(statement.version + 1),
        updatedAt: now,
      });
      audit(tx, root, eventId, paymentId, "recorded", now);
      return { id: paymentId };
    },
  );
}
export async function voidPayment(
  uid: string,
  paymentId: string,
  raw: unknown,
  requestId: string,
) {
  idSchema.parse(paymentId);
  const input = paymentVoidInputSchema.parse(raw),
    eventId = randomUUID();
  return operation(
    uid,
    "payment-void",
    requestId,
    { paymentId, ...input },
    async (tx, root, now) => {
      const ref = root.collection("payments").doc(paymentId);
      const payment = paymentDto(await tx.get(ref));
      const statementRef = root
        .collection("statements")
        .doc(payment.statementId);
      const statement = statementDto(await tx.get(statementRef));
      if (
        payment.voidedAt ||
        statement.status !== "issued" ||
        statement.studentId !== payment.studentId
      )
        throw new AppError(
          409,
          "Khoản thu không còn hợp lệ hoặc không khớp bảng kê.",
        );
      if (
        statement.activePaymentCount < 1 ||
        statement.paidVnd < payment.amountVnd
      )
        throw new Error("Payment aggregate invariant failed");
      tx.update(ref, { voidedAt: now, voidReason: input.reason });
      tx.update(statementRef, {
        paidVnd: statementMoneySchema.parse(
          statement.paidVnd - payment.amountVnd,
        ),
        activePaymentCount: statement.activePaymentCount - 1,
        version: statementVersionSchema.parse(statement.version + 1),
        updatedAt: now,
      });
      audit(tx, root, eventId, paymentId, "voided", now);
      return { id: paymentId };
    },
  );
}
export async function listPayments(
  uid: string,
  statementId: string,
  raw: unknown,
) {
  await getStatement(uid, idSchema.parse(statementId));
  const input = z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(50).default(20),
    })
    .strict()
    .parse(raw);
  let query = userRef(uid)
    .collection("payments")
    .where("statementId", "==", statementId)
    .orderBy("receivedDate", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (input.cursor) {
    const cursor = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), id: idSchema })
      .strict()
      .parse(decode(input.cursor));
    query = query.startAfter(cursor.date, cursor.id);
  }
  const docs = (await query.limit(input.limit + 1).get()).docs,
    page = docs.slice(0, input.limit),
    last = page.at(-1);
  return {
    items: page.map(paymentDto),
    nextCursor:
      docs.length > input.limit && last
        ? encode({ date: last.get("receivedDate"), id: last.id })
        : null,
  };
}
