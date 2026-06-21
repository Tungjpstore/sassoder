# AWS SES Production Access Appeal Draft

Support case: `178190906800099`

Use this as the reply body in AWS Support Center after AWS asks for more detail about the SES sending process.

```txt
Hello AWS Support team,

Thank you for reviewing our request. I would like to provide additional details about our Amazon SES use case and the controls we will use to protect SES reputation and recipients.

Application and domain
- Product: LogiVN, a SaaS platform for restaurants in Vietnam.
- Domain: logivn.com.
- SES region: US East (N. Virginia), us-east-1.
- The domain logivn.com has completed DKIM verification in us-east-1.

Email use case
- We will use Amazon SES for transactional and account-related email only.
- We will not send purchased-list email, cold outreach, affiliate campaigns, or third-party marketing.
- Planned email types:
  1. Account verification and login/security emails.
  2. Restaurant owner/staff operational notifications.
  3. Billing/subscription notices for LogiVN customers.
  4. Optional scheduled operational reports requested by restaurant owners.
- Recipients are users who registered for LogiVN, restaurant staff invited by an owner/manager, or explicit operational recipients configured by the restaurant account owner.

Expected volume
- Initial volume is low while we are onboarding customers: usually under 100 emails/day.
- Near-term expected production volume is under 1,000 emails/day.
- We can start with a conservative sending limit and request increases later only after real usage justifies it.

Recipient list management
- We maintain recipients in our own application database.
- Recipients are created through user registration, staff invitation, or owner-configured reporting preferences.
- We do not import or buy email lists.
- We remove or disable recipients when a user leaves a restaurant workspace, a staff account is revoked, or a report recipient is removed by the account owner.

Bounce and complaint handling
- We will configure SES event publishing for bounces and complaints before switching production traffic to SES.
- Hard bounces and complaints will be suppressed from future sends.
- We will monitor bounce and complaint rates and pause sending if there is an abnormal spike.
- We will keep Resend/our existing email route as fallback until SES deliverability controls are verified.

Unsubscribe and preferences
- Transactional security and billing emails are required for service operation.
- Optional scheduled reports and non-critical notifications will have recipient preferences and removal controls inside LogiVN.
- If we add any marketing emails in the future, we will implement explicit opt-in and unsubscribe links before sending them through SES.

Sample email content

Example 1: Account verification
Subject: Verify your LogiVN account
Body: Hello, use this verification link/code to finish signing in to LogiVN. This request was initiated from logivn.com. If you did not request it, you can ignore this email.

Example 2: Billing notice
Subject: LogiVN subscription payment notice
Body: Hello, your LogiVN subscription for [restaurant name] has a payment due on [date]. You can review your subscription and invoice from your LogiVN dashboard.

Example 3: Operational report
Subject: Daily operations summary for [restaurant name]
Body: Hello, here is the daily summary requested for your restaurant workspace, including orders, revenue, reservations, and operational alerts. You can disable scheduled reports in LogiVN settings.

Security and compliance controls
- We will send from verified logivn.com identities only.
- DKIM is enabled for logivn.com.
- We will keep SPF/DMARC aligned for the domain.
- SES credentials will be stored only as server-side environment variables and scoped to SES sending/event handling where possible.
- We will not expose SES credentials to client-side code.

Please reconsider our request for SES production access. We are happy to start with conservative sending limits and provide any additional details needed.

Best regards,
LogiVN team
```
