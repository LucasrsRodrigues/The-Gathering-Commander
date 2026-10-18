// Required verbatim by the Wizards of the Coast Fan Content Policy.
export const FAN_CONTENT_NOTICE =
  'The Gathering Hall is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.'

export function FanContentNotice() {
  return <p className="fan-notice">{FAN_CONTENT_NOTICE}</p>
}
