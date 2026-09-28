# Design Pass: Premium Campus Storefront

The palette stays navy #00356B, white and gold #C9A227, with Playfair Display headings and Inter body text. Everything is plain CSS plus one small IntersectionObserver in `Layout.tsx`, with no UI libraries.

## 1. Announcement bar + hero

**What changed:** a thin gold bar above the navbar reads "Officially Licensed Yale Merchandise · Visit us at 57 Broadway, New Haven". The Home hero is now full-width navy with subtle diagonal varsity-scarf stripes (a CSS `repeating-linear-gradient`), a large white serif headline, and a gold underline that draws in on load. The buttons are gold "Shop the Collection" and outlined "About us".

**Why it helps:** stating "officially licensed" and a real street address up front builds trust. A confident branded hero looks like an established store, not a template, so visitors stay and keep browsing.

## 2. Product presentation

**What changed:** product cards (and the Home category tiles) lift 4px with a soft navy-tinted shadow on hover, and the image zooms in 5%. Prices are larger, in bold navy. On the product page, size buttons are pills. A sold-out size is crossed out (strikethrough plus a diagonal line, dashed border) and disabled, and the stock line lists the sold-out sizes.

**Why it helps:** the hover response tells shoppers the card is clickable and makes the products feel tactile, and easy-to-scan prices speed up comparison. A disabled sold-out size stops shoppers picking something they can't buy, so fewer leave frustrated.

## 3. Motion

**What changed:** sections, category tiles and product cards fade in and slide up 16px (about 0.5s) the first time they scroll into view. One IntersectionObserver in `Layout.tsx` also catches cards that render later, such as chat results. With `prefers-reduced-motion: reduce`, everything appears immediately, and the hover zoom and lift, the panel slide, the typing dots and the underline animation are all switched off.

**Why it helps:** gentle motion guides the eye down the page and makes the site feel polished and alive, which encourages scrolling to more products. Honoring reduced-motion keeps it comfortable for shoppers who are sensitive to animation.

## 4. Chat as a "concierge"

**What changed:** the panel header now reads "Campus Customs Concierge" with a small green "online" dot. The shopper's bubbles are navy and the concierge's are light gray on a white background. Three bouncing dots show while a reply is on its way, and the panel slides and fades smoothly in and out. "Clear chat" is now a small trash icon (with an accessible label), so the full title fits at phone width.

**Why it helps:** a named, "online" concierge feels like personal service rather than a bot, so shoppers are more willing to ask questions that lead to a sale. The typing dots reassure them it's working, and clearly separated bubbles make the conversation easy to follow.

## Checked

In Edge, 24 of 25 automated checks passed at desktop width (1366px) and phone width (375px). The one failure was a mistake in my test: it expected the reduced-motion transition time as the text "1e-05", but the browser reports "1e-06s", so the site itself was fine there.

- **Pages:** announcement bar, hero stripes and underline animation, scroll reveal, hover lift and zoom, size pills, sold-out size disabled.
- **Chat:** concierge header, typing dots, bubble colors, and the panel sliding open and closed. When closed, the panel doesn't block clicks on the page.
- **Reduced motion:** off-screen cards are fully visible with no transitions.
- **Phone:** no horizontal scrolling, the menu opens, and the panel fits the screen.
- **Nothing from earlier broke:** chips, chat results on the page, result card → product page, login with history loaded, and stock badges (checked on the demo database copy).
