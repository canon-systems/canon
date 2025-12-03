/**
 * Email service for sending automation notifications
 * TODO: Integrate with a real email service like SendGrid, Mailgun, etc.
 */

export interface AutomationEmailData {
  to: string;
  subject: string;
  html: string;
  automationId?: string;
  ruleId?: string;
}

/**
 * Send an email notification
 * Currently logs to console - replace with real email service
 */
export async function sendEmail(emailData: AutomationEmailData): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📧 Sending email notification:', {
      to: emailData.to,
      subject: emailData.subject,
      automationId: emailData.automationId,
      ruleId: emailData.ruleId,
    });

    // TODO: Replace with real email service integration
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({
    //   to: emailData.to,
    //   from: process.env.FROM_EMAIL || 'noreply@sync.dev',
    //   subject: emailData.subject,
    //   html: emailData.html,
    // });

    // For now, just simulate success
    return { success: true };
  } catch (error: any) {
    console.error('Failed to send email:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send automation completion notification
 */
export async function sendAutomationNotification({
  userEmail,
  repoName,
  ruleName,
  previewUrl,
  summary,
}: {
  userEmail: string;
  repoName: string;
  ruleName: string;
  previewUrl?: string;
  summary: {
    filesAnalyzed: number;
    significantChanges: number;
    confidence: string;
    documentsCount: number;
    diagramsCount: number;
  };
}): Promise<{ success: boolean; error?: string }> {
  const subject = `Repository automation completed - ${repoName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333; margin-bottom: 20px;">Repository Automation Completed</h1>

      <p style="margin-bottom: 16px;">Hi there,</p>

      <p style="margin-bottom: 16px;">
        Your automation rule "<strong>${ruleName}</strong>" has completed processing changes in <strong>${repoName}</strong>.
      </p>

      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #333;">📊 Summary</h3>
        <ul style="margin: 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;"><strong>Files Analyzed:</strong> ${summary.filesAnalyzed}</li>
          <li style="margin-bottom: 8px;"><strong>Significant Changes:</strong> ${summary.significantChanges}</li>
          <li style="margin-bottom: 8px;"><strong>Confidence:</strong> ${summary.confidence}</li>
          <li style="margin-bottom: 8px;"><strong>Documents Generated:</strong> ${summary.documentsCount}</li>
          <li style="margin-bottom: 0;"><strong>Diagrams Generated:</strong> ${summary.diagramsCount}</li>
        </ul>
      </div>

      ${previewUrl ? `
        <div style="text-align: center; margin: 30px 0;">
          <a href="${previewUrl}"
             style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
            Review Changes
          </a>
        </div>

        <p style="margin-bottom: 16px;">
          The automation has generated new content for your review. Please visit the link above to approve or reject the changes before they are published.
        </p>
      ` : ''}

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

      <p style="margin-bottom: 16px; color: #666; font-size: 14px;">
        This automation helps keep your documentation up-to-date with your codebase changes.
      </p>

      <p style="margin-bottom: 0; color: #999; font-size: 12px;">
        Best regards,<br>
        Your Sync Team
      </p>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject,
    html,
  });
}
