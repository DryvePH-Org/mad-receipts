type DbError = { message: string; code?: string };

// Postgres errors can name tables, columns and constraints. Only messages we
// raised ourselves (SQLSTATE P0001, written for people) reach the screen;
// everything else becomes a generic sentence and is logged on the server.
export function safeDbMessage(error: DbError) {
  switch (error.code) {
    case "P0001":
      return error.message;
    case "23505":
      return "That already exists.";
    case "23514":
    case "22001":
    case "22P02":
      return "One of the values is not allowed. Check what you entered.";
    case "42501":
      return "You do not have permission to do that.";
    default:
      console.error("database error", error.code, error.message);
      return "Something went wrong. Please try again.";
  }
}
