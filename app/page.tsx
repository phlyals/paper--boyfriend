import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getLatestConversation } from "@/lib/db/store";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversation = await getLatestConversation(user.id);

  redirect(conversation ? `/chat/${conversation.id}` : "/pick");
}
