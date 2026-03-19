<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8FAFD; margin: 0; padding: 0; }
        .container { max-width: 560px; margin: 40px auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E5EAF0; overflow: hidden; }
        .header { background: linear-gradient(135deg, #4285F4, #3367D6); padding: 32px; text-align: center; }
        .header h1 { color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0; }
        .content { padding: 32px; color: #1F1F1F; font-size: 14px; line-height: 1.6; }
        .content a { color: #4285F4; text-decoration: none; font-weight: 500; }
        .btn { display: inline-block; padding: 12px 32px; background: #4285F4; color: #FFFFFF !important; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
        .footer { padding: 24px 32px; border-top: 1px solid #E5EAF0; font-size: 12px; color: #9AA0A6; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SmartSense Loire</h1>
        </div>
        <div class="content">
            ${kcSanitize(msg("emailBody"))?no_esc}
        </div>
        <div class="footer">
            Secured by SmartSense Loire Trust Framework
        </div>
    </div>
</body>
</html>
