# Commit Messages
Commits should have the following format:
```
git commit -m "<type>(<scope>): <subject>"
```

Rules:

* **`type`** can be any of the following:
`docs`: for documentation changes
`feat`: for new features
`fix`: for bug fixes
`perf`: for performance improvements
`refactor`: for code refactoring
`revert`: for reverting changes
`style`: for code style changes
`test`: for test changes
`release`: for release
`license`: for license changes

* **`scope`** should be the one of the following:
`arkitect`: for arkitect/ changes
`demohouse/*`: for demohouse changes, e.g. `demohouse/chat2cartoon`

* **`subject`** is a short description of the change in lower case, cannot longer than 100 characters