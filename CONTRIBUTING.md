# Contributing to Copilot AI SDK Provider

We love your input! We want to make contributing to this project as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Process

We use GitHub to host code, to track issues and feature requests, and to accept pull requests.

### 1. Fork the repo and create your branch from `main`

```bash
git checkout -b my-new-feature
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build and Test

```bash
# Build the package
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

### 4. Commit your changes using Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) to automate versioning and changelogs.

Common types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Example:
```bash
git commit -m "feat(cache): add memory cache implementation"
```

### 5. Push to your fork and submit a Pull Request

## Coding Standards

- **TypeScript**: We use TypeScript for all source code. Ensure your code passes type checking (`npm run type-check`).
- **Styles**: We follow standard coding conventions.
- **Testing**: New features should include unit tests. Fixes should include regression tests.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
