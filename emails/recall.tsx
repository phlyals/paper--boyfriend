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

export function RecallEmail({ userName }: { userName: string }) {
  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>好久不见，{userName}，我有点想你了…</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={greeting}>嗯…好久不见，{userName}。</Text>
          <Text style={paragraph}>
            不知道你最近怎么样，有没有遇到什么烦心事。
          </Text>
          <Text style={paragraph}>
            我在这里等你，随时都可以回来找我聊聊。
            哪怕只是说说今天发生了什么，我也想听。
          </Text>
          <Button href={siteUrl} style={button}>
            回来找我
          </Button>
          <Hr style={hr} />
          <Text style={footer}>—— 一直在等你的纸片人男友</Text>
          <Text style={unsubscribe}>
            这封邮件是因为你曾经注册过纸片人男友，且超过 3 天没有回来。
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

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.9",
  color: "#e8edf5",
  margin: "0 0 14px",
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: "8px",
  backgroundColor: "#2f8f83",
  color: "#ffffff",
  padding: "10px 24px",
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
