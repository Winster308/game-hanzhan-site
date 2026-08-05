import nodemailer from 'nodemailer';
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const to = process.env.TEST_TO;

const transporter = nodemailer.createTransport({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  auth: { user, pass },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});

try {
  const info = await transporter.sendMail({
    from: user,
    to,
    subject: '【游戏汉化站】SMTP 连通性测试',
    html: '<p>这是一封 SMTP 连通性测试邮件。收到即表示配置正常 ✅</p>',
  });
  console.log('SMTP SEND OK:', info.messageId);
} catch (e) {
  console.error('SMTP SEND FAIL:', e.message);
  process.exit(1);
}
