export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult {
  return { ok: false, error, fieldErrors };
}
