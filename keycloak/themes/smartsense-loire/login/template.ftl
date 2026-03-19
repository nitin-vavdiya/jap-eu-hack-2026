<#macro registrationLayout bodyClass="" displayInfo=false displayMessage=true displayRequiredFields=false>
<!DOCTYPE html>
<html class="${properties.kcHtmlClass!}">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <#if properties.meta?has_content>
        <#list properties.meta?split(' ') as meta>
            <meta name="${meta?split('==')[0]}" content="${meta?split('==')[1]}"/>
        </#list>
    </#if>
    <title>${msg("loginTitle",(realm.displayName!''))}</title>
    <link rel="icon" href="${url.resourcesPath}/img/logo.svg"/>
    <#if properties.stylesCommon?has_content>
        <#list properties.stylesCommon?split(' ') as style>
            <link href="${url.resourcesCommonPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
    <#if properties.styles?has_content>
        <#list properties.styles?split(' ') as style>
            <link href="${url.resourcesPath}/${style}" rel="stylesheet" />
        </#list>
    </#if>
</head>
<body class="login-pf ${bodyClass!}">
    <div id="kc-header">
        <div id="kc-header-wrapper"></div>
    </div>

    <div class="container-fluid">
        <div class="card-pf">
            <header id="kc-content-header">
                <#if displayRequiredFields>
                    <div class="subtitle">
                        <span class="required">*</span> ${msg("requiredFields")}
                    </div>
                </#if>
            </header>

            <div id="kc-content">
                <div id="kc-content-wrapper">
                    <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
                        <div class="alert alert-${message.type}">
                            <span class="message-text">${kcSanitize(message.summary)?no_esc}</span>
                        </div>
                    </#if>

                    <#nested "form">

                    <#if displayInfo>
                        <div id="kc-info">
                            <div id="kc-info-wrapper">
                                <#nested "info">
                            </div>
                        </div>
                    </#if>
                </div>
            </div>
        </div>
    </div>

    <#if realm.internationalizationEnabled && locale.supported?size gt 1>
        <div id="kc-locale">
            <div id="kc-locale-wrapper">
                <div id="kc-locale-dropdown">
                    <a href="#" id="kc-current-locale-link">${locale.current}</a>
                    <ul>
                        <#list locale.supported as l>
                            <li><a href="${l.url}">${l.label}</a></li>
                        </#list>
                    </ul>
                </div>
            </div>
        </div>
    </#if>
</body>
</html>
</#macro>
