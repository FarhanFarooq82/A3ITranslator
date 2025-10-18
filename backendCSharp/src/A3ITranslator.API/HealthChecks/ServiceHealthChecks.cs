using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using A3ITranslator.Infrastructure.Configuration;
using A3ITranslator.Infrastructure.Services.Azure;

namespace A3ITranslator.API.HealthChecks;

/// <summary>
/// Health check for Azure STT Service
/// </summary>
public class AzureSTTServiceHealthCheck : IHealthCheck
{
    private readonly AzureSTTService _service;

    public AzureSTTServiceHealthCheck(IOptions<ServiceOptions> options, ILogger<AzureSTTService> logger)
    {
        _service = new AzureSTTService(options, logger);
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var isHealthy = await _service.CheckHealthAsync();
            
            return isHealthy 
                ? HealthCheckResult.Healthy("Azure STT Service is healthy")
                : HealthCheckResult.Unhealthy("Azure STT Service configuration is invalid");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Azure STT Service health check failed", ex);
        }
    }
}

/// <summary>
/// Health check for Azure TTS Service
/// </summary>
public class AzureTTSServiceHealthCheck : IHealthCheck
{
    private readonly AzureTTSService _service;

    public AzureTTSServiceHealthCheck(IOptions<ServiceOptions> options, ILogger<AzureTTSService> logger)
    {
        _service = new AzureTTSService(options, logger);
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            var isHealthy = await _service.CheckHealthAsync();
            
            return isHealthy 
                ? HealthCheckResult.Healthy("Azure TTS Service is healthy")
                : HealthCheckResult.Unhealthy("Azure TTS Service configuration is invalid");
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy("Azure TTS Service health check failed", ex);
        }
    }
}
