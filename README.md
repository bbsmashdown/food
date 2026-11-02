# Food: family meal planner

A small website for planning dinners, building the grocery list, and keeping recipes.
It lives at `food.yourdomain.com`. Anyone with the link can **view**. Only people with the **family passcode** can **change** the plan. Both phones see the same plan.

## What is in this folder

| Path | What it is |
|---|---|
| `recipes/` | One `.md` file per recipe. The 24 here are samples. Delete them when you add your own. |
| `settings.txt` | Theme nights, cuisine groups and pantry staples. Plain text. |
| `attachments/` | Photos or PDFs of original recipes. Link to them from a recipe file. |
| `public/` | The app itself. You never need to touch this. |
| `functions/` | The small piece that saves the shared plan. You never need to touch this. |
| `build.js` | Turns the recipe files into the site. Same idea as your main site. |

## Setup (about 20 minutes, one time)

### 1. Put the folder on GitHub
1. On github.com click **New repository**. Name it `food`. Keep it private. Click **Create repository**.
2. Click **uploading an existing file**. Unzip this folder on your computer, then drag *everything inside it* into the page.
3. Click **Commit changes**.

### 2. Create the Cloudflare Pages project
1. In Cloudflare go to **Workers & Pages → Create → Pages → Connect to Git** and choose the `food` repository.
2. Use these settings: **Build command** `node build.js`, **Build output directory** `dist`, **Root directory** blank. (Same as your main site.)
3. Click **Save and Deploy**. When it finishes you get a `food-xxxx.pages.dev` address. The app opens, but changes only save on one device until steps 3 and 4 are done.

### 3. Create the storage
1. In Cloudflare go to **Storage & Databases → KV → Create a namespace**. Name it `food`.
2. Open your Pages project → **Settings → Bindings → Add → KV namespace**. Variable name: `FOOD` (capital letters). Namespace: the one you just made. Save.

### 4. Set the logins
Pages project → **Settings → Variables and Secrets → Add**. Choose **Secret** for both kinds below.

**One family, anyone can view (simplest):** Name `PASSCODE`, value any word or phrase you both will remember. Anyone with the link can see the plan; only people with the passcode can change it.

**Several households, everyone signs in:** Name `HOUSEHOLDS`, value a list in this exact format:

    {"smiths": "corn-bread-42", "jones": "another passcode here"}

Each name is a household name (what people type as the username) and each value is that household's passcode. Use straight quotes, put a comma between households, and no comma after the last one. Each household gets its own separate plan, and nobody can see a plan without signing in. When `HOUSEHOLDS` exists, `PASSCODE` is ignored.

To add or change a household later, edit the `HOUSEHOLDS` value, save, then redeploy (step 5). Passcodes are shared by everyone in a household, so choose something other than a simple word.

### 5. Redeploy once
Pages project → **Deployments** → on the latest one click **⋯ → Retry deployment**. Bindings only take effect on a new deploy.

### 6. Use your own address
Pages project → **Custom domains → Set up a custom domain** → type `food.yourdomain.com`. Cloudflare adds the record for you if your domain is on Cloudflare.

### 7. Put it on both phones
Open the address in Safari → **Share → Add to Home Screen**. With a single passcode, the app asks for it the first time you change something. With households, it asks for the household name and passcode when you open it. Either way you enter it once per device.

## Everyday use

- **Plan tab**: pick Cook, Leftovers or Take-out for each night. Cook nights show suggestions.
- **Week tab**: the whole week at a glance. **Groceries tab**: whole week or one recipe, tap to check things off.
- **‹ ›** at the top moves between weeks. **Settings** (bottom of the sidebar on a computer, bottom of the page on a phone) turns Breakfast, Lunch and Sides on or off, and signs out when logins are on.

## Editing on your computer (GitHub Desktop)

1. Install GitHub Desktop and sign in with your GitHub account.
2. **File → Clone repository**, pick `food`, choose a folder on your computer, click **Clone**.
3. Edit files in that folder with any text editor (add recipes, change `settings.txt`).
4. Back in GitHub Desktop you will see the changed files. Type a short summary, click **Commit to main**, then **Push origin**. Cloudflare rebuilds the site in about a minute.

- **Theme nights and pantry staples per household:** open **Settings**. Each day has a theme dropdown (None, or any cuisine or tag your recipes use), and the pantry list is a box you can edit. Each household's choices are saved with its login. Until a household changes them, it uses the defaults in `settings.txt`. **Use the site defaults** switches back.

## Adding recipes

Send me photos, links or PDFs and I will turn them into recipe files. To write one yourself, copy `templates/recipe-template.md` into the `recipes` folder, rename it (lowercase, dashes, ending in `.md`), and fill it in. The template explains every line. It is not published; only files in `recipes/` are. If a recipe file has a mistake, the build fails and the message says which file and line; the old site stays up.

- **Meals:** dinner, breakfast, lunch and side can go on the weekly plan. dessert, baking, drink and other show in the Recipes tab and can be added as **Extras** on the Plan tab.
- **Cuisine and tags:** `cuisine:` is one value (Mexican, Italian...). `tags:` is an optional comma-separated list (soup, barbecue, vegetarian). Tags become filter buttons on the Recipes tab. To get a "By cuisine" button in the planner, add a `genre:` line to `settings.txt`; it matches either a cuisine or a tag.
- **Aisles:** produce, meat, dairy, dry, bread.
- **Original source:** upload the photo or PDF into `attachments/`, then use `source_type: photo`, `source_label: Grandma's card`, `source_url: /attachments/card.jpg`. Use `web` or `pdf` the same way.
- **Last made:** optional `last_made: 2026-10-20` helps the app suggest things you have not had in a while.

## Shopping

- **Groceries tab:** "Shop for the week" combines every planned recipe and every Extra for that week. "Shop for one recipe" covers one planned night.
- **Any recipe:** open it in the Recipes tab, pick 1×, 2× or 3×, and tap **Shop for this recipe** for a one-off list.

## Groceries into Apple Reminders (one-time setup)

Pasting a list into Reminders makes a single reminder, so the app hands the list to a small Shortcut instead.

1. Open the **Shortcuts** app on your iPhone, tap **+**.
2. Tap **Add Action**, search **Split Text**, add it. Tap the blue "Text" and choose **Shortcut Input**. Leave the separator on **New Lines**.
3. Add the action **Repeat with Each**. It uses the Split Text result automatically.
4. Inside the repeat, add **Add New Reminder**. Tap the reminder text and choose the variable **Repeat Item**. Tap the list name and pick your Groceries list.
5. Tap the shortcut name at the top and rename it exactly **Add Groceries**. Tap Done.

After that, the **Send to Reminders** button on the Groceries tab adds one reminder per item. The first time, iOS asks permission to use Reminders. Items you have checked off in the app are left out.

## Good to know

- Cloudflare KV can take up to about a minute to show a change on the other phone. If you both edit within the same few seconds, the app shows the latest saved version and asks the second person to redo their change.
- If shared storage is not set up, the app still works but saves only on that device, and says so.
- To share light/dark theme with your main site, the app saves a cookie called `sw-theme` for your main domain. Your main site's theme code can read and set the same cookie if you want them to follow each other.
- Apple Reminders export is not built yet. It can be added later with an iPhone Shortcut.
