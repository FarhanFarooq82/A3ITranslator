using Azure.AI.OpenAI;
using Azure;

// This is a test file to check the correct Azure OpenAI types
public class TestAzureOpenAI
{
    public void TestTypes()
    {
        // Check available types
        var client = new OpenAIClient("endpoint", new AzureKeyCredential("key"));
        var options = new ChatCompletionsOptions();
        var systemMessage = new ChatRequestSystemMessage("system");
        var userMessage = new ChatRequestUserMessage("user");
    }
}
