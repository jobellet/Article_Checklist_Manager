# journal_guidelines.json Format

An **array** of journal objects. Each object may contain:

- `journal` (string): Journal name.
- `article_type` or `article_types` (string or object/array): Types of articles.
- `title_limit`, `abstract_limit`, `word_limit`, etc. (strings): Numeric limits.
- `figure_limit` (string): Max figures/tables.
- `reference_limit` (string): Max references.
- `structure` (string): Required sections in the manuscript.
- `other_requirements` (string or array): Additional notes or policies.
- `mission_and_policies` (object): Nested policy fields (for JoCN).
- `initial_submission`, `revised_submission`, etc. (object): Submission rules.
- `manuscript_formatting`, `journal_cover_images`, etc. (object): Format specs.
- `last_accessed` (string): ISO date when guidelines were fetched.

Each top-level array element must be a valid JSON object; unknown fields are
ignored by the loader.
