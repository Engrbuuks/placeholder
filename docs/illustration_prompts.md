# Placeholder illustration prompts

The prompts for the real illustrations that replace the drawn art. Generate each image, name it as shown, and upload them to the chat; Claude places them, sizes them for phones and desktops, and adds alt text.

**Status (23 Oct 2026).** The scenes without people are now drawn into the site as vector art (src/components/illustrations.tsx): the four What it does cards and the empty states for inbox, hot leads, bookings, campaigns and results. Their prompts below are kept only as a reference. Still to come from an image tool, because they show people: hero.png, band_first_customer.png, auth_panel.png, booking_confirmed.png and social_share.png. The How it works cards keep their small icons.

**Style tail.** Every prompt ends with this so all the images match:

> Style: modern editorial illustration, flat shapes with soft paper grain and gentle shadows, limited palette of warm off white #F4F2EF, charcoal #111111, vivid orange #FF5A14 and soft peach #FFEDE3, orange used only on the key element. Calm, confident, optimistic. No text, letters, numbers, logos, brand names or readable screens anywhere.

**Tip.** Make the hero first. When you like it, give it to the image tool as a style reference for all the others.

## Landing page

### hero.png (1600 x 1200, landscape 4:3)
Beside the headline "A customer messaged you at 9pm. Who answered?"
```
A small business owner, a Black woman in her thirties, relaxing at home in the evening on a sofa, a mug in her hand, a moon visible through the window behind her. Her phone rests on the side table, glowing softly, and a gentle stream of small rounded chat bubbles rises from it; the bubbles start grey and turn orange as they float upward, each with a small orange tick. She is not looking at the phone: she is calm because it is handled. Plain #F4F2EF background, generous empty space on the left. Style: modern editorial illustration, flat shapes with soft paper grain and gentle shadows, limited palette of warm off white #F4F2EF, charcoal #111111, vivid orange #FF5A14 and soft peach #FFEDE3, orange used only on the key element. Calm, confident, optimistic. No text, letters, numbers, logos, brand names or readable screens anywhere.
```

### What it does, four cards (1200 x 900 each, landscape 4:3)
These replace the icons on the four cards. No particular trade or industry: any business that gets enquiries.
```
feature_answer.png: A smartphone with a few rounded chat bubbles arriving from different directions, and a calm reply bubble going out in orange, a small crescent moon above to show it answers at any hour. No readable words. Plain #F4F2EF background, subject centred with space around. [style tail]
```
```
feature_hot_leads.png: A row of small rounded message cards, most of them grey, with one lifted slightly above the rest and glowing orange, a soft warm halo around it, showing the one customer who is ready to buy. Plain #F4F2EF background, subject centred with space around. [style tail]
```
```
feature_booking.png: A simple calendar card with one time slot filled in orange and a small bell beside it, suggesting a booking and a reminder. No numbers or words. Plain #F4F2EF background, subject centred with space around. [style tail]
```
```
feature_follow_up.png: A paper plane looping back towards a small open door, with a dotted path and a single orange star beside the door, suggesting a customer brought back. Plain #F4F2EF background, subject centred with space around. [style tail]
```

### How it works, three steps (1200 x 900 each, landscape 4:3)
```
step_find_leaks.png: A large simple website page shown as a shape with blank blocks instead of words, and a magnifying glass held over it revealing three small orange drips leaking from gaps in the page, like water escaping. Plain #F4F2EF background. [style tail]
```
```
step_answer.png: A smartphone standing upright like a small friendly kiosk, with rounded chat bubbles flowing in from the left (grey) and answers flowing out to the right (orange), at night with a few small stars, suggesting replies within seconds at any hour. No readable words in the bubbles. Plain #F4F2EF background. [style tail]
```
```
step_convert.png: A wall calendar with several days filled with orange markers, a small upward trend line rising beside it, and a handshake in the foreground, showing enquiries turned into booked appointments and revenue. No numbers or words. Plain #F4F2EF background. [style tail]
```

### band_first_customer.png (1000 x 1000, square)
In the orange "Start today" band, so it must sit on orange.
```
A happy business owner, an East African man, shaking hands across a counter with his first new customer, both smiling, a small celebratory burst of shapes above them. Drawn in charcoal, off white and peach only, with no orange, because the image sits on an orange background. Transparent background, or a plain #FF5A14 background if transparency is not possible. Style: modern editorial illustration, flat shapes with soft paper grain and gentle shadows. Calm, confident, optimistic. No text, letters, numbers, logos, brand names or readable screens anywhere.
```

## Sign up and log in

### auth_panel.png (900 x 1200, portrait 3:4)
Beside "Every enquiry answered. Every lead followed up."
```
A confident business owner, a South Asian woman, standing in the doorway of her small business at closing time, glancing at her phone with a relaxed smile while a few orange chat bubbles float beside her. Warm late afternoon light. Plain #F4F2EF background with space at the top. [style tail]
```

## Inside the app: empty states (800 x 800 each, square)
These show when a list is empty, so keep them small, simple and quiet: one idea each, lots of empty space.
```
empty_inbox.png: A tidy empty mailbox with its little orange flag down, a coffee cup beside it, conveying "all caught up". Plain #F4F2EF background. [style tail]
```
```
empty_hot.png: A small thermometer at a cool level beside a quiet bell with an orange clapper, suggesting "you will be alerted when a lead heats up". Plain #F4F2EF background. [style tail]
```
```
empty_bookings.png: A blank desk calendar with one orange pin waiting to be placed, conveying "your first booking will appear here". Plain #F4F2EF background. [style tail]
```
```
empty_campaigns.png: A paper plane resting on a desk, ready to launch, with a faint dotted flight path ahead and an orange tip. Plain #F4F2EF background. [style tail]
```
```
empty_results.png: A young plant sprouting from a small pot, with one orange leaf, beside an empty bar chart shape, conveying "results will grow here". No numbers. Plain #F4F2EF background. [style tail]
```

## Customer facing

### booking_confirmed.png (800 x 800, square)
Shown to a customer after they book.
```
A smiling customer, a young Black man, holding his phone and giving a thumbs up, with a calendar card beside him marked by a big orange tick. Plain #F4F2EF background. [style tail]
```

## Sharing

### social_share.png (1200 x 630, wide)
The preview when the site link is shared on WhatsApp, LinkedIn or X. Claude adds the headline over it in code.
```
A wide calm scene: on the right, a small business owner looking relaxed with a phone, orange chat bubbles flowing towards the phone from the left across the image. Keep the left half mostly empty for a headline. Plain #F4F2EF background. [style tail]
```

## When you upload
- PNG or WebP, at the sizes above or larger.
- Transparent backgrounds are welcome; otherwise keep the exact #F4F2EF so the images blend into the page.
- Upload them in any order with these file names. Claude converts them to WebP, makes phone and desktop sizes, writes alt text, keeps the drawn art as a fallback, and checks every page at 390px and desktop.
- The footer dunes stay as the drawn shapes.
