/* @flow strict-local */
import * as Sentry from '@sentry/react-native';
import type { UrlParams } from '../utils/url';
import type { Auth } from './transportTypes';
import type { FixmeUntypedFetchResult } from './apiTypes';
import { getAuthHeaders } from './transport';
import { encodeParamsForUrl } from '../utils/url';
import userAgent from '../utils/userAgent';
import { networkActivityStart, networkActivityStop } from '../utils/networkActivity';
import {
  interpretApiResponse,
  MalformedResponseError,
  NetworkError,
  RequestError,
} from './apiErrors';
import * as logging from '../utils/logging';

const apiVersion = 'api/v1';

export const getFetchParams = <P: $Diff<$Exact<RequestOptions>, {| headers: mixed |}>>(
  auth: Auth,
  params: P,
): RequestOptions => {
  const { body } = params;
  const contentType =
    body instanceof FormData
      ? 'multipart/form-data'
      : 'application/x-www-form-urlencoded; charset=utf-8';

  return {
    headers: {
      'Content-Type': contentType,
      'User-Agent': userAgent,
      ...getAuthHeaders(auth),
    },
    ...params,
  };
};

const apiFetch = async (
  auth: Auth,
  route: string,
  params: $Diff<$Exact<RequestOptions>, {| headers: mixed |}>,
) => fetch(new URL(`/${apiVersion}/${route}`, auth.realm).toString(), getFetchParams(auth, params));

/** (Caller beware! Return type is the magic `empty`.) */
export const apiCall = async (
  auth: Auth,
  route: string,
  params: $Diff<$Exact<RequestOptions>, {| headers: mixed |}>,
  isSilent: boolean = false,
): Promise<FixmeUntypedFetchResult> => {
  try {
    networkActivityStart(isSilent);

    let response = undefined;
    let json = undefined;
    try {
      response = await apiFetch(auth, route, params);
      json = await response.json().catch(() => undefined);
    } catch (error) {
      if (error instanceof TypeError) {
        // This really is how `fetch` is supposed to signal a network error:
        //   https://fetch.spec.whatwg.org/#ref-for-concept-network-error⑥⓪
        throw new NetworkError(error.message);
      }
      throw error;
    }

    const result = interpretApiResponse(response.status, json);
    /* $FlowFixMe[incompatible-return] We let the caller pretend this data
         is whatever it wants it to be. */
    return result;
  } catch (errorIllTyped) {
    const error: mixed = errorIllTyped; // https://github.com/facebook/flow/issues/2470

    if (!(error instanceof Error)) {
      throw new Error('Unexpected non-error thrown in apiCall');
    }

    const { httpStatus, data } = error instanceof RequestError ? error : {};

    const response = data !== undefined ? data : '(none, or not valid JSON)';
    logging.info({ route, params, httpStatus, response });
    Sentry.addBreadcrumb({
      category: 'api',
      level: 'info',
      data: {
        route,
        params,
        httpStatus,
        response,
        errorName: error.name,
        errorMessage: error.message,
      },
    });

    if (error instanceof MalformedResponseError) {
      logging.warn(`Bad response from server: ${JSON.stringify(data) ?? 'undefined'}`);
    }

    throw error;
  } finally {
    networkActivityStop(isSilent);
  }
};

export const apiGet = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
  isSilent: boolean = false,
): Promise<FixmeUntypedFetchResult> =>
  apiCall(
    auth,
    `${route}?${encodeParamsForUrl(params)}`,
    {
      method: 'get',
    },
    isSilent,
  );

export const apiPost = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, route, {
    method: 'post',
    body: encodeParamsForUrl(params),
  });

export const apiFile = async (
  auth: Auth,
  route: string,
  body: FormData,
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, route, {
    method: 'post',
    body,
  });

export const apiPut = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, route, {
    method: 'put',
    body: encodeParamsForUrl(params),
  });

export const apiDelete = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, route, {
    method: 'delete',
    body: encodeParamsForUrl(params),
  });

export const apiPatch = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, route, {
    method: 'patch',
    body: encodeParamsForUrl(params),
  });

export const apiHead = async (
  auth: Auth,
  route: string,
  params: UrlParams = {},
): Promise<FixmeUntypedFetchResult> =>
  apiCall(auth, `${route}?${encodeParamsForUrl(params)}`, {
    method: 'head',
  });
