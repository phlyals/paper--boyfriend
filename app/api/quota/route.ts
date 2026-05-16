import { requireApiUser } from "@/lib/auth/session";
import { countTodayImages } from "@/lib/db/store";

export async function GET() {
  const { user, response } = await requireApiUser();
  if (!user) return response;
  const used = await countTodayImages(user.id);
  return Response.json({ used, limit: 5 });
}
