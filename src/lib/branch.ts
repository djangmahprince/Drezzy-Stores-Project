import "server-only";
import { cookies } from "next/headers";

/** The branch the staff member chose in the top bar (all, accra or kumasi). Lists and reports filter by it. */
export async function currentBranch(): Promise<"all" | "accra" | "kumasi"> {
  const v = (await cookies()).get("drezzy_branch")?.value;
  return v === "accra" || v === "kumasi" ? v : "all";
}
