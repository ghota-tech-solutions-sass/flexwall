/**
 * The automation, as the Shortcuts app names things (English iOS 17+).
 * Kept in one component so the editor and /setup never drift apart.
 */
export function ShortcutSteps({ imageUrl }: { imageUrl?: string }) {
  return (
    <ol className="howto">
      <li>
        Open <b>Shortcuts</b>, go to the <b>Automation</b> tab and tap <b>+</b>.
      </li>
      <li>
        Choose <b>Time of Day</b>, set <b>7:00</b>, <b>Daily</b>, then pick <b>Run Immediately</b> and turn off{" "}
        <b>Notify When Run</b>.
      </li>
      <li>
        Tap <b>Create New Shortcut</b> and add <b>Get Contents of URL</b>. Paste {imageUrl ? "the image link above" : "your image link"}.
      </li>
      <li>
        Add <b>Set Wallpaper Photo</b> (just <b>Set Wallpaper</b> on older iOS). Choose <b>Lock Screen</b>, then open the
        arrow and turn off <b>Show Preview</b> and <b>Crop to Subject</b>.
      </li>
      <li>
        Tap <b>Done</b>. To see it right away, open the shortcut and press play once.
      </li>
    </ol>
  );
}
