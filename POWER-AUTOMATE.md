# Sending card top-up reminders into Microsoft Teams

This guide explains how to get Imperial Subs to remind the Finance team, in a Microsoft Teams
channel, that a prepaid card needs topping up before a subscription renews. It is written for
someone who administers their own Microsoft 365 tenant but does not write code.

Everything below was checked against Microsoft's own documentation in **July 2026**. Where I could
not verify something, I say so plainly rather than guessing — those passages are marked
**Not verified**. Please treat them as things to confirm on screen rather than as instructions.

---

## 1. The most important thing: the old method no longer exists

If you have set up a Teams notification from an external system before, you almost certainly used an
**Office 365 connector** (the feature called "Incoming Webhook", reached from a channel's menu). That
route is now closed.

Microsoft announced the retirement in July 2024 and then extended it repeatedly. The published
sequence, taken from Microsoft's developer blog post
[Retirement of Office 365 connectors within Microsoft Teams](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/),
ran as follows: creation of new connectors was to be blocked from 15 August 2024 and all connectors
were to stop working from 1 October 2024; that was extended to December 2025; the deadline for
migrating webhook URLs moved to 31 January 2025, then to 31 March 2026, then to 30 April 2026. The
final update, dated 14 April 2026, set the deprecation rollout to **begin on 18 May 2026 and complete
on 22 May 2026**. After 22 May 2026, Office 365 connectors no longer function.

The matching Microsoft 365 Message Center notice,
[MC1181996](https://mc.merill.net/message/MC1181996) (published 31 October 2025, last updated
15 April 2026), gives the same rollout window of 18 to 22 May 2026 and tells administrators to
"Complete migration before May 18, 2026 to avoid service disruption".

Because today is **29 July 2026**, that window has passed. You should assume any connector-based
incoming webhook URL is dead, and you should not spend time looking for the old menu item. Microsoft's
recommended replacement is Power Automate, surfaced inside Teams as the **Workflows** app.

One housekeeping note for this repository: `.env.example` currently describes `TEAMS_WEBHOOK_URL` as
an "Incoming webhook or Power Automate ... URL". Only the second of those is now valid. The variable
itself is still the right place to put the new URL.

---

## 2. What replaces it, and what it costs

Two Power Automate building blocks matter here, and the difference in licensing between them decides
the whole design.

The first is the **Microsoft Teams connector**. Microsoft's connector reference at
[learn.microsoft.com/en-us/connectors/teams](https://learn.microsoft.com/en-us/connectors/teams/)
lists it as **Standard** tier for Power Automate, Power Apps, Logic Apps and Copilot Studio. It
contains the trigger **"When a Teams webhook request is received"** (operation ID
`TeamsIncomingWebhookTrigger`), which "allows you to start a flow by making a POST request to an
exposed endpoint and supports sending adaptive cards in the request body". It also contains the
action **"Post message in a chat or channel"** (operation ID `PostMessageInChatOrChannel`), along
with **"Post adaptive card in a chat or channel"**. That same page notes a message size limit of
approximately **28 KB** for these posting actions, including all HTML elements, and notes that these
actions require the Workflows app to be available and set to "allow" in the Teams admin centre.

Microsoft's own support article,
[Create incoming webhooks with Workflows for Microsoft Teams](https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498),
states in as many words: *"Using these templates and the Teams webhook trigger does not require a
premium license to use."* It also confirms that *"Both Adaptive card and Message card format are
supported."* This is the single most useful sentence in this guide.

The second building block is the **HTTP connector**, which is what a flow would need in order to call
`GET /api/alerts/digest` itself. Here the licensing is less favourable. The connector page for
[HTTP with Microsoft Entra ID](https://learn.microsoft.com/en-us/connectors/webcontentsv2/) gives a
tier table showing **Premium** for Power Automate, **Premium** for Power Apps and **Standard** for
Logic Apps. That matches the legend on Microsoft's
[connector reference overview](https://learn.microsoft.com/en-us/connectors/connector-reference/),
which defines the premium badge as "a Premium connector for Power Automate and Power Apps or a
Standard connector for Azure Logic Apps".

**Not verified — please check on screen.** I could not find a single unambiguous Microsoft sentence
stating that the plain **"HTTP"** action (as opposed to the Entra ID variant) is premium in Power
Automate. It does not appear on Microsoft's
[Standard connectors list](https://learn.microsoft.com/en-us/connectors/connector-reference/connector-reference-standard-connectors),
and I could not locate it on the
[Premium connectors list](https://learn.microsoft.com/en-us/connectors/connector-reference/connector-reference-premium-connectors)
either, which may simply reflect that built-in operations are catalogued differently from
subscription-based connectors. Microsoft's training module
[Overview of HTTP connectors in Power Automate](https://learn.microsoft.com/en-us/training/modules/http-connectors/1-introduction)
says only "The Premium HTTP connection is built into Microsoft Power Apps and Microsoft Power
Automate", which is suggestive but self-contradictory in its wording. The practical test is simple
and takes ten seconds: open the flow designer, search for the HTTP action, and look for a **Premium**
label beside it. My recommendation is to plan on the assumption that it is premium, because the
evidence points that way and because the alternative design below avoids the question entirely.

Why this matters for Imperial Edutech specifically: Microsoft's
[Power Automate licensing FAQ](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)
states that "Users with the free plan or one of the Microsoft 365 license plans can only access
standard connectors", and that for Office 365 licences "Access to premium connectors" is explicitly
not included. The
[deep dive on seeded licences](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/deep-dive-on-specific-license)
says the same thing in table form: standard connectors included, premium connectors not included,
custom connectors not included, with an allowance of 6,000 actions per user per day. So unless
somebody at Imperial Edutech holds a **Power Automate Premium** licence, a flow built on the HTTP
action will not run.

---

## 3. The two possible directions, and which to choose

There are two ways to wire this up, and they differ in which end initiates the conversation.

**Direction A — the app pushes to Teams.** Power Automate exposes a webhook URL. Imperial Subs runs
its own schedule, works out which cards need topping up, and sends an HTTP POST containing a finished
Adaptive Card to that URL. The flow's only job is to take what arrives and post it into the channel.

**Direction B — the flow pulls from the app.** A scheduled flow wakes up on weekday mornings, calls
`GET /api/alerts/digest?key=…` using the HTTP action, parses the JSON that comes back, checks whether
there is anything worth reporting, and posts a message if there is.

**Recommendation: use Direction A.** The reason is licensing rather than elegance. Direction A uses
only the Teams webhook trigger, which Microsoft states in writing does not require a premium licence,
so it works on the Power Automate rights already bundled with your Microsoft 365 subscriptions.
Direction B depends on the HTTP connector, which on the balance of evidence is premium and therefore
needs at least one paid Power Automate Premium licence — for the person who owns the flow, since a
flow runs under its owner's entitlements. For a single scheduled reminder, that is a poor use of
budget.

There is a secondary argument in the same direction. In Direction A the decision about *whether*
anything needs saying stays in the Next.js application, in TypeScript, where it can be tested and
version-controlled. In Direction B that logic has to be rebuilt inside the flow designer using
conditions and expressions, which is harder to review and easy to break silently.

The one genuine advantage of Direction B is that it needs no outbound scheduling in your app, and no
inbound secret stored in your app's environment. If Imperial Subs is deployed somewhere without a
reliable scheduler, that may tip the balance — but a Next.js deployment on almost any modern host has
a cron facility available.

---

## 4. Direction A — setting up the webhook (recommended)

These steps are genuinely sequential, so they are numbered. The labels come from Microsoft's
[support article](https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498);
where that article names something verbatim, I have quoted it.

1. Open the **Workflows** app in Microsoft Teams. The support article describes opening Workflows
   "from any entry point" without prescribing one, so use whichever route your Teams client offers.
2. Search the templates. The channel-facing templates are named **"Send webhook alerts to a
   channel"**, **"Send webhook alerts from specific people to a channel"** and **"Send webhook alerts
   from people in an org to a channel"**. For a message coming from your own server rather than from
   a named person, choose **"Send webhook alerts to a channel"**.
3. Choose the team and the channel that the Finance team watches.
4. Select **Save**.
5. On the details page that follows, select **Copy** to take the webhook URL.
6. Put that URL into the `TEAMS_WEBHOOK_URL` environment variable for Imperial Subs. Treat it as a
   secret: anyone holding it can post into that channel.

From then on, Imperial Subs posts the JSON in section 6 to that URL whenever it decides a reminder is
warranted, and schedules itself — a weekday 08:30 cron in your hosting platform, for instance. The
`ALERTS_API_KEY` and the `/api/alerts/digest` endpoint remain useful for people and for ad-hoc checks,
but in this direction they are not on the critical path.

Two behavioural notes from Message Center notice
[MC1181996](https://mc.merill.net/message/MC1181996) are worth knowing before you design the message.
The Workflows webhook replacement supports MessageCard-formatted payloads and private channels, but
**bot icon and name customisation is not available**, so the message will appear as posted by the
workflow rather than under an Imperial Subs identity. Also, **interactive cards are not supported for
MessageCard-formatted payloads** — which is one more reason to send an Adaptive Card, as below,
rather than the older MessageCard format.

---

## 5. Direction B — the scheduled flow that calls the endpoint

Set this up only if you have confirmed a Power Automate Premium licence is available, or if the
Premium label turns out not to appear on the HTTP action.

The shape of the flow is: a **Recurrence** trigger, then an **HTTP** action performing a GET against
`https://your-host/api/alerts/digest?key=<ALERTS_API_KEY>`, then a **Parse JSON** action to give the
later steps named fields to work with, then a **Condition** that checks whether the digest actually
contains anything, and finally, on the true branch, the Teams action **"Post message in a chat or
channel"** or **"Post adaptive card in a chat or channel"**.

For the schedule itself, Microsoft's
[Run a cloud flow on a schedule](https://learn.microsoft.com/en-us/power-automate/run-scheduled-tasks)
article confirms the site address is **make.powerautomate.com** and names these Recurrence fields:
**Time zone**, **Start time** (in the format `YYYY-MM-DDTHH:MM:SSZ`), **Frequency**, **At these
hours**, **At these minutes** and **On these days**. For weekdays at 08:30 UK time you would set
Frequency to Week, **On these days** to Monday through Friday, **At these hours** to 8 and **At these
minutes** to 30. The article also notes that in the classic designer these appear behind **Show
advanced options**.

On the time zone: Microsoft's troubleshooting article
[Converting time zone in Power Automate](https://learn.microsoft.com/en-us/troubleshoot/power-platform/power-automate/converting-time-zone-power-automate)
documents `convertTimeZone(timestamp, sourceTimeZone, destinationTimeZone, format?)` using Windows
time-zone identifiers, and the United Kingdom's identifier is **`GMT Standard Time`**. **Not
verified:** that article does not explicitly state that `GMT Standard Time` shifts automatically for
British Summer Time. Windows time-zone identifiers normally do carry their daylight-saving rules, so
08:30 should stay 08:30 across the March and October changes, but if the timing is important to you,
confirm it by watching one run either side of a clock change rather than taking my word for it.

**Not verified — the click path to create the flow.** The Microsoft article above now leads with
Copilot-based creation: it instructs you to sign in, make sure **Home** is selected in the left
navigation pane, type a prompt into a field labelled **"Create your automation with Copilot"**, and
select **Generate**. It refers to a "Without copilot" tab for the manual route but does not spell
those steps out in the text I could retrieve. I am therefore not going to invent a
**Create → Scheduled cloud flow** path or a "Build a scheduled cloud flow" dialog, even though those
labels have existed historically. Please read the labels off your own screen. The names of the
*trigger* and *actions* — Recurrence, HTTP, Parse JSON, Condition, and the two Teams posting actions
— are verified and are what you should search for once you are in the designer.

**Not verified:** I also could not find a Microsoft page stating the licence tier of the **Parse
JSON** action. It is one of the built-in Data Operations rather than a connector, and built-in
operations are not licensed as premium connectors, so it should carry no additional cost — but the
Premium label in the designer is again the authoritative check.

If you take this route, generate the schema for Parse JSON from a real response rather than writing it
by hand: run the flow once, copy the HTTP action's output from the run history, and use the designer's
option to generate a schema from a sample payload. Note that at the time of writing the
`/api/alerts/digest` endpoint does not yet exist in this repository — only `/api/search` is present —
so its exact response shape is not yet fixed and any schema I wrote here would be a guess.

---

## 6. The Adaptive Card payload

Teams expects the card to be wrapped in a message envelope. Microsoft's page
[Create an Incoming Webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
documents the wrapper as an object with `"type": "message"` and an `attachments` array, each
attachment carrying `"contentType": "application/vnd.microsoft.card.adaptive"` and a `content` object
holding the card itself.

On the schema version: Microsoft's
[Cards reference](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference)
states that "Teams platform supports v1.5 or earlier of Adaptive Card features". The `$schema` string
to use is `http://adaptivecards.io/schemas/adaptive-card.json` — note that it is `http`, not `https`,
in Microsoft's own examples, and it is an identifier rather than an address that gets fetched. Do not
set the version to 1.6: an open bug,
[AdaptiveCards issue #9378](https://github.com/microsoft/AdaptiveCards/issues/9378) (raised 22 May
2026), reports that cards declaring 1.6 fail to render in Teams when sent through Power Automate and
that the fix is to declare 1.5.

There is one caveat worth heeding for a Finance team who will read these on their phones. The same
cards reference warns that "Microsoft Teams mobile app supports Adaptive Cards up to version 1.2" and
that later schema features "might not render correctly". The card below declares 1.5 but is
deliberately built only from elements that have existed since 1.0 — `TextBlock`, `FactSet`,
`ColumnSet` and `Action.OpenUrl` — so it should render identically on desktop and mobile.

Replace the sample values and the URL with your own. Keep the whole payload comfortably under the
28 KB message limit noted on the Teams connector page.

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.5",
        "body": [
          {
            "type": "TextBlock",
            "text": "Card top-up required before renewal",
            "weight": "Bolder",
            "size": "Large",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Imperial Edutech — subscription renewals",
            "isSubtle": true,
            "spacing": "None",
            "wrap": true
          },
          {
            "type": "FactSet",
            "facts": [
              { "title": "Subscription", "value": "Adobe Creative Cloud (Teams)" },
              { "title": "Renewal date", "value": "5 August 2026" },
              { "title": "Amount due", "value": "£596.40" },
              { "title": "Card", "value": "Prepaid card ending 4417" },
              { "title": "Current balance", "value": "£120.00" }
            ]
          },
          {
            "type": "ColumnSet",
            "separator": true,
            "columns": [
              {
                "type": "Column",
                "width": "stretch",
                "items": [
                  {
                    "type": "TextBlock",
                    "text": "Shortfall to top up",
                    "weight": "Bolder",
                    "wrap": true
                  }
                ]
              },
              {
                "type": "Column",
                "width": "auto",
                "items": [
                  {
                    "type": "TextBlock",
                    "text": "£476.40",
                    "weight": "Bolder",
                    "size": "Large",
                    "color": "Attention",
                    "wrap": true
                  }
                ]
              }
            ]
          },
          {
            "type": "TextBlock",
            "text": "Please top the card up before the renewal date or the payment will fail.",
            "wrap": true,
            "spacing": "Medium"
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "Open Imperial Subs",
            "url": "https://subs.imperiallearning.co.uk/"
          }
        ]
      }
    }
  ]
}
```

If several cards need topping up on the same morning, prefer one card containing several `FactSet`
blocks separated by headings over several separate messages — it is quieter in the channel, and it
keeps you well inside the daily action allowance.

---

## 7. Troubleshooting

If the POST returns a success status but nothing appears in the channel, the usual cause is the
envelope rather than the card. Check that the top-level object has `"type": "message"` and that the
card sits inside `attachments[0].content`, not at the top level. A payload that is a bare Adaptive
Card, with no wrapper, is accepted by some endpoints and silently ignored.

If the message appears but shows an error in place of the card, suspect the schema version first.
Confirm `version` is `"1.5"` or lower and that `$schema` is exactly
`http://adaptivecards.io/schemas/adaptive-card.json`. If it renders on desktop but not on a phone,
you have used an element newer than 1.2; simplify the card.

If the flow shows as failed in its run history with a licensing error, you have hit the premium
connector boundary described in section 2. That is the signal to abandon Direction B and move to
Direction A rather than to buy a licence for one reminder.

If the flow does not run at all at the expected time, check the Recurrence **Time zone** field before
anything else — a flow left on UTC will drift by an hour for the British Summer Time half of the year.

If nothing has arrived since roughly late May 2026 and the setup predates that, you are almost
certainly still pointing at a retired Office 365 connector URL. Recreate the webhook using the
Workflows route in section 4 and replace `TEAMS_WEBHOOK_URL`.

If posting fails only for certain channels, check that the Workflows app is available and set to
"allow" in the Teams admin centre, which the Teams connector reference lists as a requirement for the
message-posting actions.

Finally, if the channel is noisy with reminders, remember that the decision about whether to send
lives in Imperial Subs in Direction A. Adjust the `alerts.criticalDays`, `alerts.soonDays` and
`alerts.upcomingDays` settings in the application rather than trying to filter inside the flow.

---

## Sources

- [Retirement of Office 365 connectors within Microsoft Teams — Microsoft 365 Developer Blog](https://devblogs.microsoft.com/microsoft365dev/retirement-of-office-365-connectors-within-microsoft-teams/)
- [MC1181996 — Migration update for Office 365 connectors retirement in Teams, webhook URL support](https://mc.merill.net/message/MC1181996)
- [Create incoming webhooks with Workflows for Microsoft Teams — Microsoft Support](https://support.microsoft.com/en-us/office/create-incoming-webhooks-with-workflows-for-microsoft-teams-8ae491c7-0394-4861-ba59-055e33f75498)
- [Microsoft Teams connector reference — Microsoft Learn](https://learn.microsoft.com/en-us/connectors/teams/)
- [Create an Incoming Webhook — Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook)
- [Cards reference (Adaptive Card version support in Teams) — Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/platform/task-modules-and-cards/cards/cards-reference)
- [AdaptiveCards issue #9378 — schema 1.6 does not work with Teams cards via Power Automate](https://github.com/microsoft/AdaptiveCards/issues/9378)
- [HTTP with Microsoft Entra ID connector (tier table) — Microsoft Learn](https://learn.microsoft.com/en-us/connectors/webcontentsv2/)
- [Connector reference overview and premium badge legend — Microsoft Learn](https://learn.microsoft.com/en-us/connectors/connector-reference/)
- [Standard connectors list — Microsoft Learn](https://learn.microsoft.com/en-us/connectors/connector-reference/connector-reference-standard-connectors)
- [Premium connectors list — Microsoft Learn](https://learn.microsoft.com/en-us/connectors/connector-reference/connector-reference-premium-connectors)
- [Power Automate licensing FAQ — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/faqs)
- [Deep dive on specific licences, including seeded licences — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/deep-dive-on-specific-license)
- [Types of Power Automate licences — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/admin/power-automate-licensing/types)
- [Run a cloud flow on a schedule — Microsoft Learn](https://learn.microsoft.com/en-us/power-automate/run-scheduled-tasks)
- [Converting time zone in Power Automate — Microsoft Learn](https://learn.microsoft.com/en-us/troubleshoot/power-platform/power-automate/converting-time-zone-power-automate)
- [Overview of HTTP connectors in Power Automate (training module) — Microsoft Learn](https://learn.microsoft.com/en-us/training/modules/http-connectors/1-introduction)
- [Connector classification (DLP) — Microsoft Learn](https://learn.microsoft.com/en-us/power-platform/admin/dlp-connector-classification)
