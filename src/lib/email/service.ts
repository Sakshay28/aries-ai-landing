import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendNewLeadEmail(to: string, leadName: string, businessName: string) {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: 'Aries AI <notifications@ariesai.in>',
      to,
      subject: `New Lead: ${leadName}`,
      html: `<p>Great news! You have a new lead (<strong>${leadName}</strong>) for <strong>${businessName}</strong>.</p><p>Check your dashboard to view the conversation and lead details.</p>`,
    });
  } catch (error) {
    console.error('Failed to send new lead email:', error);
  }
}

export async function sendLeadAssignedEmail(
  to: string,
  leadName: string,
  businessName: string,
  source?: string,
  customTemplate?: string | null
) {
  try {
    const resend = getResend();
    if (!resend) return;

    let htmlContent = `<p>A new lead (<strong>${leadName}</strong>)${source ? ` from <strong>${source}</strong>` : ''} has just been assigned to you at <strong>${businessName}</strong>.</p><p>Open your AriesAI dashboard to reply and manage this lead.</p>`;

    if (customTemplate && customTemplate.trim()) {
      const vars: Record<string, string> = {
        lead_name: leadName,
        business_name: businessName,
        source: source || '',
      };
      htmlContent = customTemplate.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
    }

    await resend.emails.send({
      from: 'Aries AI <notifications@ariesai.in>',
      to,
      subject: `New lead assigned to you: ${leadName}`,
      html: htmlContent,
    });
  } catch (error) {
    console.error('Failed to send lead assigned email:', error);
  }
}

export async function sendWeeklySummaryEmail(to: string, businessName: string, leadsCount: number, messagesCount: number) {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: 'Aries AI <analytics@ariesai.in>',
      to,
      subject: `Weekly Summary for ${businessName}`,
      html: `<p>Here is your weekly summary for <strong>${businessName}</strong>.</p><ul><li>New Leads: ${leadsCount}</li><li>Messages Sent: ${messagesCount}</li></ul><p>Keep up the great work!</p>`,
    });
  } catch (error) {
    console.error('Failed to send weekly summary email:', error);
  }
}

export async function sendBillingReceipt(to: string, businessName: string, amount: string, planName: string) {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: 'Aries AI Billing <billing@ariesai.in>',
      to,
      subject: `Receipt for ${planName} Plan`,
      html: `<p>Thank you for your payment, <strong>${businessName}</strong>.</p><p>We have successfully received your payment of <strong>${amount}</strong> for the <strong>${planName}</strong> plan.</p><p>You can download your full invoice from the billing dashboard.</p>`,
    });
  } catch (error) {
    console.error('Failed to send billing receipt:', error);
  }
}

export async function sendFlowEmail(to: string, subject: string, body: string, fromName = 'AriesAI') {
  try {
    const resend = getResend();
    if (!resend) return false;
    await resend.emails.send({
      from: `${fromName} <notifications@ariesai.in>`,
      to,
      subject,
      html: body.replace(/\n/g, '<br/>'),
      text: body,
    });
    return true;
  } catch (error) {
    console.error('Flow engine: sendFlowEmail failed:', error);
    return false;
  }
}

export async function sendBotOfflineAlert(to: string, businessName: string) {
  try {
    const resend = getResend();
    if (!resend) return;
    await resend.emails.send({
      from: 'Aries AI Alerts <alerts@ariesai.in>',
      to,
      subject: `URGENT: Your Bot is Offline`,
      html: `<p>Hello,</p><p>The WhatsApp connection for <strong>${businessName}</strong> has been disconnected (Meta token expired).</p><p>Your bot is currently <strong>offline</strong> and cannot reply to customers.</p><p>Please log in to your dashboard immediately to reconnect WhatsApp.</p>`,
    });
  } catch (error) {
    console.error('Failed to send bot offline alert:', error);
  }
}
