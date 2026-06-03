import { StudentGame } from "@/components/student-game";

type PageProps = {
  params: Promise<{ joinCode: string }>;
};

export default async function PlayPage({ params }: PageProps) {
  const { joinCode } = await params;
  return <StudentGame joinCode={joinCode.toUpperCase()} />;
}
