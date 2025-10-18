using Microsoft.Extensions.Logging;
using A3ITranslator.Application.Services;
using A3ITranslator.Infrastructure.Services.Azure;
using A3ITranslator.Infrastructure.Services.Google;
using A3ITranslator.Infrastructure.Services.OpenAI;
using A3ITranslator.Infrastructure.Services.GenAI;
using A3ITranslator.Infrastructure.Configuration;

// A3I Translator API with comprehensive multi-provider language service support
// Registers all provider services and LanguageService with union logic

var builder = WebApplication.CreateBuilder(args);

// Configuration
builder.Services.Configure<ServiceOptions>(
    builder.Configuration.GetSection("Services"));

// Core services
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register ALL STT services as ISTTService for language aggregation
builder.Services.AddTransient<ISTTService, AzureSTTService>();
builder.Services.AddTransient<ISTTService, GoogleSTTService>();
builder.Services.AddTransient<ISTTService, OpenAISTTService>();

// Register GenAI services (replacing translation services)
builder.Services.AddTransient<IGenAIService, AzureGenAIService>();
builder.Services.AddTransient<IGenAIService, GeminiGenAIService>();
builder.Services.AddTransient<IGenAIService, OpenAIGenAIService>();

// Language aggregation service with all providers - SINGLETON for caching
builder.Services.AddSingleton<ILanguageService, LanguageService>();

// CORS for frontend testing
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

var app = builder.Build();

// Middleware pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");
app.MapControllers();

// Startup message
var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("=== A3I Translator API Starting ===");
logger.LogInformation("Available endpoints:");
logger.LogInformation("- GET  /languages/all (All supported languages)");
logger.LogInformation("- GET  /languages/stt (STT languages)");
logger.LogInformation("- GET  /languages/tts (TTS languages)");
logger.LogInformation("- GenAI services available (Azure OpenAI, Gemini, OpenAI GPT)");
logger.LogInformation("- GET  /languages/common (Common languages)");
logger.LogInformation("- POST /process-audio (Audio processing)");
logger.LogInformation("- Swagger UI: http://localhost:8000/swagger");
logger.LogInformation("=== A3I Translator API Ready ===");

app.Run();
