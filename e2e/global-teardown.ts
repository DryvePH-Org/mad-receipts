import { cleanup } from "./support";

export default async function globalTeardown() {
  await cleanup();
}
