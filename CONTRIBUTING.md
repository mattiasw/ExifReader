Contributing to ExifReader
==========================

If you want to contribute in any way, I'll be very happy to receive that help
making this project better. There are several ways to contribute and all are
welcome. You can send in suggestions for better documentation, new
functionality, or a bug-fix (just create an issue). Or you can create a pull
request for the thing you want changed or added.

Please note that this project is released with a
[Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this
project you agree to abide by its terms.

Creating an issue
-----------------

I will appreciate everything from pointing out spelling errors to a huge
functionality suggestion. Just put in enough information for me to understand
the issue. For reporting bugs specifically, please include the following if
possible:

-   A description of the issue and how to reproduce according to the issue
    template.
-   An example JPEG image where the problem can be seen. This is very valuable.

Creating a pull request
-----------------------

If the pull request has code changes, they should follow the ESLint rules and be
covered by unit tests. Running the linter and the tests is easy after
`npm install` has been run:

```bash
npm run lint
npm test
```

To specifically look at test code coverage:

```bash
npm run coverage
```

This will tell directly in the terminal if the coverage has been reduced by the
new code (it will fail) and also create a new folder with a more visual HTML
version of the report. The HTML version shows which parts of the code that the
current set of tests miss.

If you need help with writing tests, just ask. I can probably help in one way or
another.

The commit message should be descriptive and (if needed) have an explanatory
body. This is one of all the guides out there on how to write good messages:
[How to Write a Git Commit Message](https://chris.beams.io/posts/git-commit/)

In short, here are some guidelines:

-   Write the subject line in imperative mood: `Add IPTC support for records 1
    and 7`, not `Added...`, `Fixing...`, etc.
-   Try to not use more than 50 characters in the subject line with 72 as a hard
    limit (otherwise it will get truncated).
-   For non-trivial changes, add a body to explain what was changed and why.
-   Wrap the lines of the body at 72 characters.
