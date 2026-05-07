import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: "Dữ liệu không hợp lệ", details: error.flatten() },
      { status: 422 }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ ok: false, error: "Lỗi hệ thống" }, { status: 500 });
}
