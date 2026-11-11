# paragraph-border Spec

## ADDED Requirements

### Requirement: Paragraph `w:between` borders render between grouped paragraphs

Adjacent paragraphs with identical `w:pBdr` definitions form a border group. The `w:between` border SHALL render as the top line of every group paragraph except the first, and no `between` line SHALL render after the last paragraph of the group.

#### Scenario: First paragraph of a group shows its own top border

- **Given** three consecutive paragraphs sharing an identical `w:pBdr` with `w:top` and `w:between`
- **When** the document is painted
- **Then** the first paragraph's top line uses the `w:top` border properties
- **And** no `w:between` line renders above the first paragraph

#### Scenario: Interior paragraphs show the between line on top

- **Given** the same three-paragraph group
- **When** painted
- **Then** the second and third paragraphs render the `w:between` border as their top line

#### Scenario: No trailing line after the last grouped paragraph

- **Given** the same group followed by an unbordered paragraph
- **When** painted
- **Then** the third paragraph renders its own `w:bottom` border
- **And** no `w:between` line renders below it
- **And** the unbordered paragraph paints no border box

### Requirement: Paragraph `w:bar` borders render as a left vertical bar

A paragraph carrying a `w:bar` border SHALL paint a vertical line on its left edge, outside any `w:left` border and separated by the bar's own spacing, spanning the paragraph's full height.

#### Scenario: Bar border paints left of the text

- **Given** a paragraph with a `w:bar` border
- **When** painted
- **Then** a bar element renders left of the paragraph text using the bar's width, style, and color
- **And** the bar spans the full height of the paragraph fragment
