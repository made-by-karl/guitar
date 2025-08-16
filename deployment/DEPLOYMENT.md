To support deep links and redirect all unknown routes to your main index.html (Single Page Application routing), you need to configure your web server to rewrite all requests to index.html, except for static assets.

How to do this depends on your web hosting:

1. For Apache (.htaccess):
Add this to your .htaccess in the app’s root:

```
RewriteEngine On
RewriteBase /
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^.*$ /index.html [L]
```

2. For Nginx:
In your server block:
```
location / {
  try_files $uri $uri/ /index.html;
}
```

3. For static hosts (Netlify, Vercel, etc.):
Netlify: Add a _redirects file:
```
/*    /index.html   200
```

Vercel: Uses vercel.json rewrites.

4. For GitHub Pages:
Use a 404.html that redirects to index.html using JavaScript.