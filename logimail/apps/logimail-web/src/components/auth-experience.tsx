import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AtSign, KeyRound, Loader2, MailCheck, ServerCog, ShieldCheck, UserPlus } from 'lucide-react';
import { AuthLoginForm, AuthRegisterForm, ForgotPasswordForm, InviteAcceptForm } from '@/components/auth-forms';
import { LogiMailLogo } from '@/components/logimail-logo';
import { getLogimailOperationalData } from '@/lib/logimail-data';
import { getAuthenticationDomainOptions, getRegistrationDomains } from '@/lib/registration-domains';
import styles from './auth-experience.module.css';

type ExperienceMode = 'login' | 'register' | 'forgot' | 'invite';

const experienceCopy: Record<ExperienceMode, {
  eyebrow: string;
  title: string;
  description: string;
  brandTitle: string;
  brandDescription: string;
}> = {
  login: {
    eyebrow: 'LogiMail Identity',
    title: 'Chào mừng trở lại',
    description: 'Đăng nhập bằng địa chỉ LogiMail đã được cấp cho bạn.',
    brandTitle: 'Email doanh nghiệp, trong tầm kiểm soát.',
    brandDescription: 'Một danh tính cho hộp thư, lịch sử vận hành và quyền truy cập theo từng domain.',
  },
  register: {
    eyebrow: 'Tạo danh tính',
    title: 'Tạo địa chỉ LogiMail',
    description: 'Dùng mã bảo mật do quản trị viên cấp cho domain của bạn.',
    brandTitle: 'Bắt đầu bằng một địa chỉ đáng tin cậy.',
    brandDescription: 'Địa chỉ mới được tạo đồng thời trên hệ thống danh tính và mail server của LogiMail.',
  },
  forgot: {
    eyebrow: 'Khôi phục an toàn',
    title: 'Đặt lại mật khẩu',
    description: 'Mã khôi phục phải được quản trị viên tạo riêng cho đúng địa chỉ email.',
    brandTitle: 'Khôi phục quyền truy cập, không hạ thấp bảo mật.',
    brandDescription: 'Một lần xác minh cập nhật đồng bộ mật khẩu đăng nhập và mật khẩu hộp thư.',
  },
  invite: {
    eyebrow: 'Lời mời LogiMail',
    title: 'Hoàn tất tài khoản',
    description: 'Tạo mật khẩu để kích hoạt phiên làm việc được mời.',
    brandTitle: 'Workspace đã sẵn sàng cho bạn.',
    brandDescription: 'Quyền truy cập được giới hạn theo vai trò, workspace và mailbox đã phê duyệt.',
  },
};

function ExperienceShell({ mode, children, wide = false }: Readonly<{ mode: ExperienceMode; children: ReactNode; wide?: boolean }>) {
  const copy = experienceCopy[mode];
  const Icon = mode === 'register' ? UserPlus : mode === 'forgot' ? KeyRound : mode === 'invite' ? AtSign : ShieldCheck;

  return (
    <main className={styles.shell}>
      <section className={styles.brand} aria-label="LogiMail">
        <LogiMailLogo className={styles.logo} subtitle="Business Mail Platform" />
        <div className={styles.brandCopy}>
          <p className={styles.eyebrow}>Mail identity / access</p>
          <h1>{copy.brandTitle}</h1>
          <p>{copy.brandDescription}</p>
        </div>
        <div className={styles.assuranceList} aria-label="Lớp bảo vệ tài khoản">
          <div className={styles.assuranceItem}>
            <span className={styles.assuranceIcon}><MailCheck size={16} aria-hidden="true" /></span>
            <div><strong>Danh tính gắn với mailbox</strong><span>Tài khoản, domain và hộp thư được cấp phát trong cùng một luồng.</span></div>
          </div>
          <div className={styles.assuranceItem}>
            <span className={styles.assuranceIcon}><ShieldCheck size={16} aria-hidden="true" /></span>
            <div><strong>Quyền truy cập có phạm vi</strong><span>Mỗi phiên chỉ nhận đúng workspace và mailbox đã được phê duyệt.</span></div>
          </div>
          <div className={styles.platformStatus} aria-label="Thành phần xác thực">
            <span><i /> SMTP / IMAP</span>
            <span><i /> Supabase Auth</span>
            <span><i /> Audit log</span>
          </div>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={`${styles.surface} ${wide ? styles.surfaceWide : ''}`.trim()}>
          <header className={styles.panelHeader}>
            <span className={styles.panelIcon}><Icon size={19} aria-hidden="true" /></span>
            <div>
              <p className={styles.panelEyebrow}>{copy.eyebrow}</p>
              <h2>{copy.title}</h2>
              <p>{copy.description}</p>
            </div>
          </header>
          {children}
          <p className={styles.panelFooter}>Kết nối được mã hóa. Thông tin đăng nhập không được hiển thị trong nhật ký giao diện.</p>
        </div>
      </section>
    </main>
  );
}

export async function LoginExperience() {
  const { domains, status } = await getAuthenticationDomainOptions();
  return <ExperienceShell mode="login"><AuthLoginForm domains={domains} domainStatus={status} /></ExperienceShell>;
}

export async function RegisterExperience() {
  const [data, domains] = await Promise.all([getLogimailOperationalData(), getRegistrationDomains()]);
  if (data.auth.status === 'approved') redirect('/mail/inbox');

  return (
    <ExperienceShell mode="register" wide>
      {data.auth.status === 'not_configured' ? (
        <div className={styles.unavailable} role="status">
          <ServerCog size={18} aria-hidden="true" />
          <p>Dịch vụ đăng ký chưa sẵn sàng vì thiếu cấu hình Supabase. Vui lòng liên hệ quản trị viên.</p>
        </div>
      ) : <AuthRegisterForm domains={domains} />}
    </ExperienceShell>
  );
}

export async function ForgotPasswordExperience() {
  const { domains, status } = await getAuthenticationDomainOptions();
  return <ExperienceShell mode="forgot" wide><ForgotPasswordForm domains={domains} domainStatus={status} /></ExperienceShell>;
}

export function InviteExperience() {
  return <ExperienceShell mode="invite"><InviteAcceptForm /></ExperienceShell>;
}

export function AuthExperienceLoading() {
  return (
    <ExperienceShell mode="login">
      <div className={styles.loading} role="status" aria-live="polite">
        <Loader2 size={22} aria-hidden="true" />
        <span>Đang chuẩn bị cổng đăng nhập an toàn...</span>
      </div>
    </ExperienceShell>
  );
}
