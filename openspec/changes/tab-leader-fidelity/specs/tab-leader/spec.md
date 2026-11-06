# tab-leader Spec

## ADDED Requirements

### Requirement: Tab leaders are clipped to the tab span and clear of adjacent text

A tab run with a leader SHALL fill only the tab span between the preceding text and the tab stop content. The leader fill SHALL be clipped to the span boundaries and keep a small gap from the glyphs on either side, so leaders never overlap titles or page numbers.

#### Scenario: Dotted TOC leaders do not overlap text

- **Given** TOC-style paragraphs with right-aligned dot-leader tab stops
- **When** painted
- **Then** no tab span overlaps the preceding title or the following page number

#### Scenario: Leader fill keeps a gap on both sides

- **Given** a tab run with any leader
- **When** painted
- **Then** the leader fill starts at least ~2px after the tab span's left edge
- **And** ends at least ~2px before its right edge

#### Scenario: Long titles leave a short but valid leader gap

- **Given** a title long enough that little space remains before the tab stop
- **When** painted
- **Then** the tab span has positive width ending flush with the page number
- **And** the leader does not overlap either side

### Requirement: All leader types render their own glyph

The `dot`, `hyphen`, `underscore`, `heavy`, and `middleDot` leaders SHALL each render their documented fill character, with `heavy` drawn thick.

#### Scenario: Each leader type paints its glyph

- **Given** tab stops using each of the five leader types
- **When** painted
- **Then** dot renders `.`, hyphen `-`, underscore and heavy `_`, middleDot `·`
- **And** the heavy leader renders bold while the others use the regular weight
