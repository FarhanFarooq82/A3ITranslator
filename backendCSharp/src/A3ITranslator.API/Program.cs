using Microsoft.Extensions.Logging;
using A3ITranslator.Application.Services;
using A3ITranslator.Infrastructure.Services.Azure;
using A3ITranslator.Infrastructure.Services.Google;
using A3ITranslator.Infrastructure.Services.OpenAI;
using A3ITranslator.Infrastructure.Services.Session;
using A3ITranslator.Infrastructure.Services.Language;
using A3ITranslator.Infrastructure.Services.Audio;
using A3ITranslator.Infrastructure.Services.Translation;
using A3ITranslator.Infrastructure.Configuration;

var builder = WebApplication.CreateBuilder(args);

// Configuration
builder.Services.Configure<ServiceOptions>(
    builder.Configuration.GetSection("Services"));

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register ALL STT services as ISTTService for language aggregation
builder.Services.AddTransient<ISTTService, AzureSTTService>();
builder.Services.AddTransient<ISTTService, GoogleSTTService>();
builder.Services.AddTransient<ISTTService, OpenAISTTService>();

// Register ALL TTS services as ITTSService for language aggregation
builder.Services.AddTransient<ITTSService, AzureTTSService>();
builder.Services.AddTransient<ITTSService, GoogleTTSService>();
builder.Services.AddTransient<ITTSService, OpenAITTSService>();

// Register GenAI services (for now, just Azure - will add more later for fallback)
builder.Services.AddTransient<IGenAIService, AzureGenAIService>();

// Register translation services
builder.Services.AddTransient<ITranslationPromptService, TranslationPromptService>();
builder.Services.AddTransient<ITranslationOrchestrator, TranslationOrchestrator>();

// Language aggregation service with all providers - SINGLETON for caching
builder.Services.AddSingleton<ILanguageService, LanguageService>();

// Audio processing services - SINGLETON for consistency with session service
builder.Services.AddSingleton<ISTTProviderSelector, STTProviderSelector>();
builder.Services.AddScoped<IAudioProcessingOrchestrator, AudioProcessingOrchestrator>();

// Session management service
builder.Services.AddSingleton<ISessionService, InMemorySessionService>();

// CORS for frontend - Allow specific origins and credentials
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
                "http://localhost:3000",   // React default
                "http://localhost:5173",   // Vite default
                "http://localhost:5174",   // Vite alternative
                "http://127.0.0.1:3000",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174"
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials(); // Important for cookies/auth
    });
    
    // Fallback policy for development
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(origin => true) // Allow any origin in development
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Debug); // Temporarily set to Debug for TTS investigation

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseCors("AllowAll"); // Use permissive CORS in development
}
else
{
    app.UseCors("AllowFrontend"); // Use specific CORS in production
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

Console.WriteLine("=== A3I Translator API Starting ===");
Console.WriteLine("- Swagger UI: http://localhost:8000/swagger");
Console.WriteLine("=== A3I Translator API Ready ===");

app.Run();