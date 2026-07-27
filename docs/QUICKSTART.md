# 🚀 QUICK START GUIDE

## Fully Automated Workflow (One Command!)

### Record, Filter, Deduplicate & Execute Everything:

```bash
npm run automate
```

**What happens:**
1. Browser opens automatically
2. You interact with your app (click, type, etc.)
3. Press ENTER when done
4. Script automatically filters duplicates
5. Script removes redundant actions
6. Script executes the optimized recording
7. See the playback in action!

---

## Process Existing Recording

Already have a recording file?

```bash
npm run process recordings/recording-1766507394510.json
```

This will:
- Filter the recording
- Deduplicate actions
- Execute the final result

---

## Individual Commands

### Just Record:
```bash
npm run record
```
Press ENTER when done. File saved to `recordings/`

### Just Filter:
```bash
npm run filter recordings/recording-1766507394510.json
```

### Just Deduplicate:
```bash
npm run deduplicate recordings/recording-1766507394510-filtered.json
```

### Just Playback:
```bash
npm run playback recordings/recording-1766507394510-final.json
```

---

## File Naming Convention

The automation creates files in this order:

1. `recording-1766507394510.json` ← Original recording
2. `recording-1766507394510-filtered.json` ← After filtering
3. `recording-1766507394510-final.json` ← After deduplication (ready to execute)

---

## Tips

- **For best results**: Use `npm run automate` - it does everything!
- The browser stays open after playback for inspection
- All recordings are saved in the `recordings/` folder
- You can run the same recording multiple times

---

## Troubleshooting

**Error: playwright not installed?**
```bash
npm install
```

**Wrong URL?**
```bash
node src/automation/full-workflow.js https://your-actual-url.com
```

**Want to see what happened?**
- Check the `recordings/` folder
- Look at the `-final.json` file to see the optimized events
