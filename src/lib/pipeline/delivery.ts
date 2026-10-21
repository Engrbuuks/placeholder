// Sends a queued message on its channel and records the outcome.
// Web chat messages are delivered by storing them; the visitor's chat window collects them.
import { withTenant } from "../db";
import { decryptSecret } from "../crypto";
import { logActivity, notify } from "../activity";
import { firstName } from "../templates";
import { sendTemplate, sendText, withinWindow, WhatsAppError } from "../channels/whatsapp";
import { sendSms, SmsError } from "../channels/sms";
import { EmailError, sendCustomerEmail } from "../channels/email";
import { render } from "../templates";
import { publicTokenFor } from "../leadToken";
import { loadContext } from "./context";

type Row = {
  id: string;
  lead_id: string;
  body: string;
  status: string;
  channel: "webchat" | "whatsapp" | "sms" | "form" | "email";
  author: string;
  external_id: string;
  opted_out_at: Date | null;
  email: string | null;
  name: string | null;
  last_inbound_at: Date | null;
  account: string | null;
  secret_enc: string | null;
  settings: { templateName?: string; templateLanguage?: string; accountSid?: string } | null;
};

export type DeliveryOutcome = "sent" | "skipped" | "failed" | "not_queued";

export async function deliverMessage(workspaceId: string, messageId: string, fetchImpl?: typeof fetch): Promise<DeliveryOutcome> {
  const row = await withTenant(workspaceId, async (c) => {
    const { rows } = await c.query<Row>(
      `select m.id, m.lead_id, m.body, m.status, m.channel, m.author, l.external_id, l.name, l.last_inbound_at, l.opted_out_at, l.email,
              cc.external_account_id as account, cc.secret_enc, cc.settings
       from messages m
       join leads l on l.id = m.lead_id
       left join channel_connections cc on cc.workspace_id = m.workspace_id and cc.channel = m.channel
       where m.id = $1`,
      [messageId],
    );
    return rows[0] ?? null;
  });
  if (!row || row.status !== "queued") return "not_queued";

  const finish = (status: "sent" | "skipped" | "failed", detail: string | null, externalId: string | null = null) =>
    withTenant(workspaceId, async (c) => {
      await c.query(
        "update messages set status = $2, status_detail = $3, external_message_id = coalesce($4, external_message_id) where id = $1 and status = 'queued'",
        [messageId, status, detail, externalId],
      );
      if (status === "sent") await c.query("update leads set last_outbound_at = now(), updated_at = now() where id = $1", [row.lead_id]);
      if (status !== "sent") {
        await logActivity(c, workspaceId, {
          leadId: row.lead_id,
          kind: status === "skipped" ? "message_skipped" : "message_failed",
          summary: detail ?? "Message not sent",
        });
        if (status === "failed") {
          await notify(c, workspaceId, { kind: "delivery_failed", title: "A message could not be sent", body: detail ?? "", link: `/inbox/${row.lead_id}` });
        }
      }
    });

  // Follow ups never go to a customer who opted out, whatever the channel.
  if (row.opted_out_at && row.author === "automation") {
    await finish("skipped", "Not sent: the customer opted out of messages.");
    return "skipped";
  }

  if (row.channel === "email" || (row.channel === "form" && row.email)) {
    return deliverEmail(workspaceId, row, finish, fetchImpl);
  }

  if (row.channel === "form") {
    await finish("skipped", "This customer came from the lead form with no phone or email we can use. Call them.");
    return "skipped";
  }

  if (row.channel === "webchat") {
    await finish("sent", null);
    return "sent";
  }

  if (row.channel === "sms") {
    if (!row.account || !row.secret_enc || !row.settings?.accountSid) {
      await finish("failed", "SMS is not connected. Connect Twilio in Channels.");
      return "failed";
    }
    let authToken: string;
    try {
      authToken = decryptSecret(row.secret_enc);
    } catch {
      await finish("failed", "The saved Twilio auth token could not be read. Reconnect SMS in Channels.");
      return "failed";
    }
    try {
      const sid = await sendSms({ accountSid: row.settings.accountSid, authToken, from: row.account, to: row.external_id, body: row.body, fetchImpl });
      await finish("sent", null, sid);
      return "sent";
    } catch (error) {
      if (error instanceof SmsError && !error.retryable) {
        await finish("failed", `Twilio refused the text: ${error.message}`);
        return "failed";
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  // WhatsApp
  if (!row.account || !row.secret_enc) {
    await finish("failed", "WhatsApp is not connected. Connect it in Channels.");
    return "failed";
  }
  let token: string;
  try {
    token = decryptSecret(row.secret_enc);
  } catch {
    await finish("failed", "The saved WhatsApp token could not be read. Reconnect WhatsApp in Channels.");
    return "failed";
  }

  try {
    if (withinWindow(row.last_inbound_at)) {
      const id = await sendText({ phoneNumberId: row.account, token, to: row.external_id, body: row.body, fetchImpl });
      await finish("sent", null, id);
      return "sent";
    }
    const template = row.settings?.templateName;
    if (template) {
      const id = await sendTemplate({
        phoneNumberId: row.account,
        token,
        to: row.external_id,
        name: template,
        language: row.settings?.templateLanguage || "en",
        firstName: firstName(row.name),
        fetchImpl,
      });
      await finish("sent", `Sent as your approved template "${template}", because the 24 hour reply window had closed.`, id);
      return "sent";
    }
    await finish("skipped", "The 24 hour WhatsApp reply window had closed. Add an approved template in Channels to send follow ups after 24 hours.");
    return "skipped";
  } catch (error) {
    if (error instanceof WhatsAppError && !error.retryable) {
      await finish("failed", `WhatsApp refused the message: ${error.message}`);
      return "failed";
    }
    // Retryable: leave it queued and let the job retry.
    throw error instanceof Error ? error : new Error(String(error));
  }
}


async function deliverEmail(
  workspaceId: string,
  row: Row,
  finish: (status: "sent" | "skipped" | "failed", detail: string | null, externalId?: string | null) => Promise<void>,
  fetchImpl?: typeof fetch,
): Promise<DeliveryOutcome> {
  if (!row.email) {
    await finish("failed", "This customer has no email address.");
    return "failed";
  }
  const prep = await withTenant(workspaceId, async (c) => {
    const ctx = (await loadContext(c, workspaceId))!;
    const token = await publicTokenFor(c, row.lead_id);
    const owner = (
      await c.query<{ email: string }>(
        "select u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = $1 and m.role = 'owner' limit 1",
        [workspaceId],
      )
    ).rows[0]?.email;
    return { ctx, token, replyTo: ctx.settings.alertEmail ?? owner ?? null };
  });
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const unsubscribeUrl = `${base}/u/${prep.token}`;
  const t = prep.ctx.locale.assistant;
  const text = `${row.body}\n\n${render(t.emailFooter, { businessName: prep.ctx.businessName, link: unsubscribeUrl })}`;
  try {
    const id = await sendCustomerEmail(
      {
        businessName: prep.ctx.businessName,
        to: row.email,
        replyTo: prep.replyTo,
        subject: render(t.emailSubject, { businessName: prep.ctx.businessName }),
        text,
        unsubscribeUrl,
        oneClickUrl: `${base}/api/unsubscribe/${prep.token}`,
      },
      fetchImpl,
    );
    await finish("sent", null, id);
    return "sent";
  } catch (error) {
    if (error instanceof EmailError && !error.retryable) {
      await finish(/not set up/.test(error.message) ? "skipped" : "failed", error.message);
      return /not set up/.test(error.message) ? "skipped" : "failed";
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}
