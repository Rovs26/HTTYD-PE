import { HostDashboard } from "@/components/host-dashboard";

type PageProps = {
  params: Promise<{ joinCode: string }>;
};

export default async function HostPage({ params }: PageProps) {
  const { joinCode } = await params;
  return <HostDashboard joinCode={joinCode.toUpperCase()} />;
}
