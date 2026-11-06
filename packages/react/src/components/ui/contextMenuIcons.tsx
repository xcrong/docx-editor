/**
 * Context menu icons — Material Symbols, weight 400 outlined.
 * Source: https://github.com/marella/material-symbols (svg/400/outlined),
 * auto-synced from Google Fonts. `add_link` is the Material name for the
 * insert-link action (`insert_link` does not exist); `description` stands in
 * for alt text (`alt_text` does not exist in Material Symbols).
 *
 * Split out of `./Icons` (which re-exports the map below) to keep the
 * registry file under its line cap; the single `iconMap` in `./Icons`
 * stays the only lookup surface.
 */

import { SvgIcon, type IconProps } from './Icons';
import type { ComponentType } from 'react';

export function IconContentCut(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M782-114 481-415 364-298q11 17 13.5 33t2.5 35q0 64-43 107T230-80q-64 0-107-43T80-230q0-64 43-107t107-43q18 0 35.5 5t36.5 15l116-116-118-118q-17 8-34.5 11t-35.5 3q-64 0-107-43T80-730q0-64 43-107t107-43q64 0 107 43t43 107q0 19-2.5 36T367-662l514 514v34h-99ZM599-527l-66-66 249-249h99v33L599-527ZM294-666q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Zm202.5 203.5Q502-468 502-476t-5.5-13.5Q491-495 483-495t-13.5 5.5Q464-484 464-476t5.5 13.5Q475-457 483-457t13.5-5.5ZM294-166q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Z" />
    </SvgIcon>
  );
}

export function IconContentCopy(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M300-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h440q24 0 42 18t18 42v560q0 24-18 42t-42 18H300Zm0-60h440v-560H300v560ZM180-80q-24 0-42-18t-18-42v-620h60v620h500v60H180Zm120-180v-560 560Z" />
    </SvgIcon>
  );
}

export function IconContentPaste(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M180-120q-26 0-43-17t-17-43v-600q0-26 17-43t43-17h202q7-35 34.5-57.5T480-920q36 0 63.5 22.5T578-840h202q26 0 43 17t17 43v600q0 26-17 43t-43 17H180Zm0-60h600v-600h-60v90H240v-90h-60v600Zm328.5-611.5Q520-803 520-820t-11.5-28.5Q497-860 480-860t-28.5 11.5Q440-837 440-820t11.5 28.5Q463-780 480-780t28.5-11.5Z" />
    </SvgIcon>
  );
}

export function IconContentPasteOff(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m840-206-60-60v-514h-60v90H355L205-840h177q7-35 34.5-57.5T480-920q36 0 63.5 22.5T578-840h202q26 0 43 17t17 43v574ZM508.5-791.5Q520-803 520-820t-11.5-28.5Q497-860 480-860t-28.5 11.5Q440-837 440-820t11.5 28.5Q463-780 480-780t28.5-11.5ZM694-180 180-694v514h514Zm-514 60q-26 0-43-17t-17-43v-574l-59-59 43-43 752 752-43 43-59-59H180Z" />
    </SvgIcon>
  );
}

export function IconAddLink(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M700-160v-120H580v-60h120v-120h60v120h120v60H760v120h-60ZM450-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h170v60H280q-58.33 0-99.17 40.76-40.83 40.77-40.83 99Q140-422 180.83-381q40.84 41 99.17 41h170v60ZM325-450v-60h310v60H325Zm555-30h-60q0-58-40.83-99-40.84-41-99.17-41H510v-60h170q83 0 141.5 58.5T880-480Z" />
    </SvgIcon>
  );
}

export function IconLinkOff(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="m750-291-49-49q51-10 85-48t34-89q0-58-41-99t-99-41H525v-60h155q83 0 141.5 58.5T880-477q0 62-36 112t-94 74ZM594-447l-60-60h101v60h-41ZM814-56 63-807l43-43L857-99l-43 43ZM450-280H280q-83 0-141.5-58.5T80-480q0-72 44.5-127T238-676l56 56h-14q-58 0-99 41t-41 99q0 58 41 99t99 41h170v60ZM325-450v-60h79l60 60H325Z" />
    </SvgIcon>
  );
}

export function IconOpenInNew(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h279v60H180v600h600v-279h60v279q0 24-18 42t-42 18H180Zm202-219-42-43 398-398H519v-60h321v321h-60v-218L382-339Z" />
    </SvgIcon>
  );
}

export function IconDescription(props: IconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M319-250h322v-60H319v60Zm0-170h322v-60H319v60ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z" />
    </SvgIcon>
  );
}

/** Partial registry merged into `./Icons`' `iconMap` via spread. */
export const contextMenuIconMap: Record<string, ComponentType<IconProps>> = {
  content_cut: IconContentCut,
  content_copy: IconContentCopy,
  content_paste: IconContentPaste,
  content_paste_off: IconContentPasteOff,
  add_link: IconAddLink,
  link_off: IconLinkOff,
  open_in_new: IconOpenInNew,
  description: IconDescription,
};
