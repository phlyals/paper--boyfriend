import { Body, Container, Head, Html, Preview, Text, Hr } from "@react-email/components";

export function LogoutFeedbackEmail({
  userName,
  userEmail,
  feedback,
}: {
  userName: string;
  userEmail: string;
  feedback: string;
}) {
  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>用户 {userName} 退出登录并留下了反馈</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={heading}>用户退出反馈</Text>
          <Text style={field}><strong>用户名：</strong>{userName}</Text>
          <Text style={field}><strong>邮箱：</strong>{userEmail}</Text>
          <Hr style={hr} />
          <Text style={label}>反馈内容：</Text>
          <Text style={content}>{feedback}</Text>
        </Container>
      </Body>
    </Html>
  );
}

const body: React.CSSProperties = { backgroundColor: "#f5f7fb", fontFamily: "Arial, sans-serif" };
const container: React.CSSProperties = { margin: "0 auto", padding: "40px 24px", maxWidth: "500px" };
const heading: React.CSSProperties = { fontSize: "18px", fontWeight: "600", color: "#2f8f83", margin: "0 0 20px" };
const field: React.CSSProperties = { fontSize: "14px", color: "#344054", margin: "0 0 8px" };
const label: React.CSSProperties = { fontSize: "14px", fontWeight: "600", color: "#344054", margin: "0 0 8px" };
const content: React.CSSProperties = { fontSize: "15px", lineHeight: "1.8", color: "#1a1a2e", backgroundColor: "#fff", padding: "16px", borderRadius: "8px", margin: 0 };
const hr: React.CSSProperties = { border: "none", borderTop: "1px solid #dce3ee", margin: "16px 0" };
