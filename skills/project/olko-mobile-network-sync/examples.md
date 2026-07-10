# Examples

## Project Adapter
```yaml
mobileNetworkSync:
  composePath: compose.yaml
  domainTemplate: "{ip}.nip.io"
  rawIpTargets:
    - api
  services:
    - keycloak
    - pricepredictor.api
  healthWaitSeconds: 60
  urlUpdates:
    - name: oauth
      path: mobile/app/src/main/java/com/pricepredictor/mobile/data/auth/OAuthConfig.kt
      regex: 'var baseUrl = "http://[^"]+:8081"'
      replacementTemplate: 'var baseUrl = "http://{hostDomain}:8081"'
    - name: api
      path: mobile/app/src/main/java/com/pricepredictor/mobile/data/api/ApiClient.kt
      regex: '\.baseUrl\("http://[^"]+:5000/"\)'
      replacementTemplate: '.baseUrl("http://{hostIp}:5000/")'
  composeEnvUpdates:
    - service: keycloak
      key: KC_HOSTNAME_URL
      valueTemplate: "http://{hostDomain}:8081"
    - service: pricepredictor.api
      key: Keycloak__Authority
      valueTemplate: "http://{hostDomain}:8081/realms/pricepredictor"
      replaceLocalhostOnly: false
  authDiscoveryUrlTemplate: "http://{hostDomain}:8081/realms/pricepredictor/.well-known/openid-configuration"
  expectedIssuerTemplate: "http://{hostDomain}:8081/realms/pricepredictor"
  apiHealthUrlTemplate: "http://{hostIp}:5000/health"
  expectedApiHealth: "Healthy"
  adminUrlTemplate: "http://{hostDomain}:8081/admin/"
  expectedAdminStatus: 200
  redirectUriTemplate: "http://{hostDomain}:8081/realms/pricepredictor/broker/google/endpoint"
  oauthConsoleUrl: "https://console.cloud.google.com/apis/credentials"
```

## Final Report Shape
```text
Mobile Network Sync
Host LAN IP:       192.168.1.42
Host domain:       192.168.1.42.nip.io
Changed:           YES
Files updated:     compose.yaml, OAuthConfig.kt, ApiClient.kt
Authority fix:     YES
Services healthy:  keycloak healthy, pricepredictor.api healthy
Keycloak reachable:YES
API reachable:     YES
OAuth redirect:    http://192.168.1.42.nip.io:8081/realms/pricepredictor/broker/google/endpoint
Manual action:     Add OAuth redirect URI in provider console.
```
