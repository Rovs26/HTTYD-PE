import { JoinScreen } from "@/components/join-screen";

type PageProps = {
  params: Promise<{ joinCode: string }>;
};

export default async function JoinPage({ params }: PageProps) {
  const { joinCode } = await params;
  return <JoinScreen joinCode={joinCode.toUpperCase()} />;
}
