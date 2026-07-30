// Thin client for Yeastar P-Series Cloud Edition's OpenAPI (company_contact
// endpoints). This is a *different* credential from the webhook HMAC secret
// used in app/api/yeastar/webhook/route.ts — this one authenticates as a
// client application against Yeastar's REST API.
//
// Required env vars:
//   YEASTAR_API_BASE_URL      e.g. https://your-pbx.yeastarcloud.com
//   YEASTAR_API_CLIENT_ID
//   YEASTAR_API_CLIENT_SECRET

const BASE_URL = process.env.YEASTAR_API_BASE_URL!;
const CLIENT_ID = process.env.YEASTAR_API_CLIENT_ID!;
const CLIENT_SECRET = process.env.YEASTAR_API_CLIENT_SECRET!;
const API_PATH = "openapi/v1.0";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

// Yeastar's token endpoint/flow — confirm the exact path and grant params
// against your PBX's actual API Authentication docs page once you have
// real credentials; this follows the documented client-credential pattern
// but the exact field names should be checked against your PBX version.
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  const res = await fetch(`${BASE_URL}/${API_PATH}/get_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: CLIENT_ID,
      password: CLIENT_SECRET,
    }),
  });

  if (!res.ok) {
    throw new Error(`Yeastar auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`Yeastar auth error: ${data.errmsg}`);
  }

  // expires_in is in seconds per Yeastar's docs; cache with a safety margin.
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.access_token_expire_time ?? 3600) * 1000,
  };

  return cachedToken.accessToken;
}

async function yeastarRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
) {
  const token = await getAccessToken();
  const url = `${BASE_URL}/${API_PATH}/${path}?access_token=${token}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (data.errcode !== 0) {
    throw new Error(`Yeastar API error on ${path}: ${data.errmsg} (${data.errcode})`);
  }

  return data;
}

export type YeastarNumberEntry = {
  num_type:
    | "business_number"
    | "business_number2"
    | "business_fax"
    | "mobile_number"
    | "mobile_number2"
    | "home_number"
    | "home_number2"
    | "home_fax"
    | "other_number";
  number: string;
};

export type YeastarContact = {
  id: number;
  contact_name: string;
  company?: string;
  email?: string;
  business?: string;
  business2?: string;
  mobile?: string;
  mobile2?: string;
  home?: string;
  home2?: string;
  business_fax?: string;
  home_fax?: string;
  other?: string;
};

export async function createYeastarContact(params: {
  firstName: string;
  lastName?: string;
  email?: string;
  company?: string;
  numbers: YeastarNumberEntry[];
}): Promise<number> {
  const data = await yeastarRequest("POST", "company_contact/create", {
    first_name: params.firstName,
    last_name: params.lastName,
    email: params.email,
    company: params.company,
    number_list: params.numbers,
  });
  return data.id;
}

export async function updateYeastarContact(
  yeastarContactId: number,
  params: {
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    numbers?: YeastarNumberEntry[];
  }
): Promise<void> {
  await yeastarRequest("POST", "company_contact/edit", {
    id: yeastarContactId,
    first_name: params.firstName,
    last_name: params.lastName,
    email: params.email,
    company: params.company,
    number_list: params.numbers,
  });
}

export async function deleteYeastarContact(yeastarContactId: number): Promise<void> {
  await yeastarRequest("POST", "company_contact/delete", {
    id_list: [yeastarContactId],
  });
}
