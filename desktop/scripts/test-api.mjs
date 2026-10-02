// Associated request contexts share the desktop browser's HttpOnly session cookie.
export function localRequests(page, origin) {
  return Object.fromEntries(['get','post','put','patch','delete'].map(method=>[method,(url,options={})=>page.request[method](url,{
    ...options,headers:{origin,...options.headers}
  })]));
}
