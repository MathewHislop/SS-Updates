async function request(method, url, body, isForm = false) {
  const opts = { method };
  if (body !== undefined) {
    if (isForm) {
      opts.body = body;
    } else {
      opts.headers = { "Content-Type": "application/json" };
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = await res.json();
      if (j.error) message = j.error;
    } catch {
      // response wasn't JSON — fall back to statusText
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listBusinesses: () => request("GET", "/api/businesses"),
  createBusiness: (name) => request("POST", "/api/businesses", { name }),
  renameBusiness: (id, name) => request("PATCH", `/api/businesses/${id}`, { name }),
  deleteBusiness: (id) => request("DELETE", `/api/businesses/${id}`),
  getBundle: (id) => request("GET", `/api/businesses/${id}/bundle`),

  saveCustomer: (bizId, customer) => request("POST", `/api/businesses/${bizId}/customers`, customer),
  deleteCustomer: (id) => request("DELETE", `/api/customers/${id}`),

  saveJob: (bizId, job) => request("POST", `/api/businesses/${bizId}/jobs`, job),
  deleteJob: (id) => request("DELETE", `/api/jobs/${id}`),

  updateProfile: (bizId, patch) => request("PATCH", `/api/businesses/${bizId}/profile`, patch),

  uploadFiles: (bizId, fileList) => {
    const form = new FormData();
    Array.from(fileList).forEach((f) => form.append("files", f));
    return request("POST", `/api/businesses/${bizId}/files`, form, true);
  },
  deleteFile: (id) => request("DELETE", `/api/files/${id}`),
  fileDownloadUrl: (id) => `/api/files/${id}/download`,

  saveInteractionLog: (bizId, entry) => request("POST", `/api/businesses/${bizId}/interaction-logs`, entry),
  deleteInteractionLog: (id) => request("DELETE", `/api/interaction-logs/${id}`),

  exportSnapshot: () => request("GET", "/api/export"),

  getVersion: () => request("GET", "/api/version"),

  getLicenseStatus: () => request("GET", "/api/license/status"),
  revalidateLicense: () => request("POST", "/api/license/revalidate"),
  activateLicense: (licenseKey) => request("POST", "/api/license/activate", { licenseKey }),
  deactivateLicense: () => request("POST", "/api/license/deactivate"),
  completeOnboarding: () => request("POST", "/api/license/complete-onboarding"),

  getUpdateStatus: () => request("GET", "/api/update"),
  installUpdate: () => request("POST", "/api/update/install"),

  savePricingOverride: (customerId, override) =>
    request("POST", `/api/customers/${customerId}/pricing-overrides`, override),
  deletePricingOverride: (id) => request("DELETE", `/api/pricing-overrides/${id}`),
};
