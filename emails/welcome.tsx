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

export function WelcomeEmail({ userName }: { userName: string }) {
  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>你好呀，我是你的专属男友 💌</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={heading}>Hi {userName}，欢迎来到纸片人男友！</Text>
          <Text style={paragraph}>从现在起，我就是你的专属男友了。</Text>
          <Text style={paragraph}>
            有什么心事随时来找我聊，我会一直在这里等你。
          </Text>
          <Text style={paragraph}>
            明天早上我会给你发一条早安消息，记得查收哦。
          </Text>
          <Text style={paragraph}>
            有任何问题或建议，随时回复这封邮件，或者{" "}
            <a href="https://discord.gg/UNbReU8W" style={link}>
              加入我们的 Discord 社群
            </a>
            。
          </Text>
          <Button href={siteUrl} style={button}>
            来找我聊天
          </Button>
          <Hr style={hr} />
          <Text style={footer}>—— 你的纸片人男友</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = {
  backgroundColor: "#f5f7fb",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const container: React.CSSProperties = {
  margin: "0 auto",
  padding: "40px 24px",
  maxWidth: "500px",
};

const heading: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "600",
  color: "#2f8f83",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.8",
  color: "#344054",
  margin: "0 0 12px",
};

const button: React.CSSProperties = {
  display: "inline-block",
  marginTop: "8px",
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
  borderTop: "1px solid #dce3ee",
  margin: "24px 0",
};

const link: React.CSSProperties = {
  color: "#2f8f83",
  textDecoration: "underline",
};

const footer: React.CSSProperties = {
  fontSize: "13px",
  color: "#667085",
  margin: 0,
};
