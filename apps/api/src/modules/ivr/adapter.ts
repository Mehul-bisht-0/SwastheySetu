/** STATUS: Implemented — provider boundary; no vendor SDK or credentials. */
import { ivrProviderEvent, type IvrProviderEvent, type IvrProviderResponse } from '@swasthyasetu/contracts/ivr';

export interface TelephonyAdapter<Input, Output> {
  parse(input: Input): IvrProviderEvent;
  render(response: IvrProviderResponse): Output;
}

export const prototypeJsonAdapter: TelephonyAdapter<unknown, IvrProviderResponse> = {
  parse(input) { return ivrProviderEvent.parse(input); },
  render(response) { return response; },
};
