import { AppError } from "@/lib/response";

export type MapErrorCode =
  | "MAP_INVALID_REQUEST"
  | "MAP_RATE_LIMITED"
  | "MAP_NO_RESULT"
  | "MAP_PROVIDER_TIMEOUT"
  | "MAP_PROVIDER_UNAVAILABLE"
  | "MAP_LOW_CONFIDENCE";

export class MapApiError extends AppError {
  constructor(
    message: string,
    status = 400,
    public code: MapErrorCode = "MAP_INVALID_REQUEST"
  ) {
    super(message, status);
  }
}
