import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://zmc.flods.cyou";

export function DailyLoveEmail({
  userName,
  loveLetter,
}: {
  userName: string;
  loveLetter: string;
}) {
  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>早安 {userName}，今天也想你了 ☀️</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={greeting}>早安，{userName} ☀️</Text>
          <Text style={letter}>{loveLetter}</Text>
          <Button href={siteUrl} style={button}>
            回来找我聊天
          </Button>
          <Hr style={hr} />
          <Text style={footer}>—— 你的纸片人男友</Text>
          <Text style={unsubscribe}>
            这封邮件是因为你注册了纸片人男友。
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#0c0f15",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const container: React.CSSProperties = {
  margin: "0 auto",
  padding: "48px 24px",
  maxWidth: "500px",
};

const greeting: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "600",
  color: "#5ecfc3",
  margin: "0 0 20px",
};

const letter: React.CSSProperties = {
  fontSize: "16px",
  lineHeight: "2",
  color: "#e8edf5",
  margin: "0 0 28px",
  whiteSpace: "pre-wrap",
};

const button: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#2f8f83",
  color: "#ffffff",
  padding: "10px 20px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: "500",
  textDecoration: "none",
};

const hr: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  margin: "28px 0",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#667085",
  margin: "0 0 8px",
};

const unsubscribe: React.CSSProperties = {
  fontSize: "11px",
  color: "#444c5c",
  margin: 0,
};
