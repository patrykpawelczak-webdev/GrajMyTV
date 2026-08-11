# Custom Command Alias Rules

- When the user sends a prompt consisting of or containing the instruction "git", perform the following steps automatically:
  1. Add all changed and untracked files (`git add .`)
  2. Create a meaningful commit with a descriptive commit message based on the recent changes (`git commit -m "..."`)
  3. Push the changes to the current remote branch (`git push`)
