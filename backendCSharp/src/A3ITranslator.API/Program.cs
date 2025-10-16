using Microsoft.Extensions.Logging;

// Step 1: Basic Program.cs for endpoint testing
// Minimal setup without complex dependencies

var builder = WebApplication.CreateBuilder(args);

// Step 1: Basic services only
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Step 1: Basic CORS for frontend testing
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Step 1: Basic logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

var app = builder.Build();

// Step 1: Basic middleware pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowAll");
app.MapControllers();

// Step 1: Basic startup message
var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("=== STEP 1: A3I Translator API Starting ===");
logger.LogInformation("Available endpoints:");
logger.LogInformation("- GET  /available-languages (Languages list)");
logger.LogInformation("- POST /process-audio (Audio processing - basic validation only)");
logger.LogInformation("- Swagger UI: http://localhost:5000/swagger");
logger.LogInformation("=== STEP 1: Ready for endpoint testing ===");

app.Run();
