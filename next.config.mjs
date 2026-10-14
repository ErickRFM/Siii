/** @type {import('next').NextConfig} */
const nextConfig={
 typedRoutes:true,
 async headers(){
  const security=[
   {key:'X-Content-Type-Options',value:'nosniff'},
   {key:'X-Frame-Options',value:'DENY'},
   {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
   {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  ];
  if(process.env.NODE_ENV==='production')security.push({key:'Strict-Transport-Security',value:'max-age=31536000; includeSubDomains'});
  return [{source:'/:path*',headers:security}];
 }
};
export default nextConfig;
