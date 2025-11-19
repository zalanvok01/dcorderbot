const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const OWNER_ID = process.env.OWNER_ID;
const ordersFile = path.join('/app/data', 'orders.json');

// Create data directory if it doesn't exist
const dataDir = '/app/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}


// Load orders from file
function loadOrders() {
  try {
    if (fs.existsSync(ordersFile)) {
      return JSON.parse(fs.readFileSync(ordersFile, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading orders:', err);
  }
  return {};
}

// Save orders to file
function saveOrders(orders) {
  try {
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Error saving orders:', err);
  }
}

let orders = loadOrders();

client.once('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  
  const guild = client.guilds.cache.first();
  if (guild) {
    guild.commands.create(
      new SlashCommandBuilder()
        .setName('ordernew')
        .setDescription('Create a new order')
        .addChannelOption(option => option.setName('channel').setDescription('Channel to post order').setRequired(true))
        .addStringOption(option => option.setName('name').setDescription('Order name').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Order amount').setRequired(true))
    );
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isCommand()) {
      if (interaction.commandName === 'ordernew') {
        if (interaction.user.id !== OWNER_ID) {
          return interaction.reply({ content: '❌ Only the owner can use this command!', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const orderName = interaction.options.getString('name');
        const amount = interaction.options.getInteger('amount');
        const orderId = `order_${Date.now()}`;

        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle(`📦 New Order: ${orderName}`)
          .addFields(
            { name: 'Order ID', value: orderId, inline: true },
            { name: 'Amount', value: `${amount}`, inline: true },
            { name: 'Status', value: '🔓 Unclaimed', inline: true }
          )
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`claim_${orderId}`)
              .setLabel('Claim Order')
              .setStyle(ButtonStyle.Success)
          );

        const message = await channel.send({ embeds: [embed], components: [row] });
        
        // Save to file
        orders[orderId] = {
          orderId,
          claimed: false,
          claimedBy: null,
          messageId: message.id,
          channelId: channel.id,
          orderName,
          amount
        };
        saveOrders(orders);

        await interaction.reply({ content: `✅ Order created in ${channel}!`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
  const parts = interaction.customId.split('_');
  const action = parts[0];
  const orderId = parts.slice(1).join('_');

      
      if (action === 'claim') {
        const orderData = orders[orderId];

        if (!orderData) {
          return interaction.reply({ content: '❌ Order not found!', ephemeral: true });
        }

        if (orderData.claimed) {
          return interaction.reply({ content: `❌ This order was already claimed by <@${orderData.claimedBy}>!`, ephemeral: true });
        }

        orderData.claimed = true;
        orderData.claimedBy = interaction.user.id;
        saveOrders(orders);

        const channel = client.channels.cache.get(orderData.channelId);
        const message = await channel.messages.fetch(orderData.messageId);
        
        const updatedEmbed = EmbedBuilder.from(message.embeds[0])
          .spliceFields(2, 1, { name: 'Status', value: `✅ Claimed by <@${interaction.user.id}>`, inline: true });

        const disabledRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`claim_${orderId}`)
              .setLabel('Claim Order')
              .setStyle(ButtonStyle.Success)
              .setDisabled(true)
          );

        await message.edit({ embeds: [updatedEmbed], components: [disabledRow] });

        const modal = new ModalBuilder()
          .setCustomId(`feedback_${orderId}`)
          .setTitle('Order Feedback');

        const feedbackInput = new TextInputBuilder()
          .setCustomId('feedback_text')
          .setLabel('Provide your feedback')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        const row2 = new ActionRowBuilder().addComponents(feedbackInput);
        modal.addComponents(row2);

        await interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      const [action, orderId] = interaction.customId.split('_');

      if (action === 'feedback') {
        const feedback = interaction.fields.getTextInputValue('feedback_text');
        const orderData = orders[orderId];

        const owner = await client.users.fetch(OWNER_ID);
        const feedbackEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('📝 Order Feedback Received')
          .addFields(
            { name: 'Order ID', value: orderId },
            { name: 'Claimed by', value: `<@${interaction.user.id}>` },
            { name: 'Feedback', value: feedback }
          )
          .setTimestamp();

        await owner.send({ embeds: [feedbackEmbed] });
        await interaction.reply({ content: '✅ Feedback submitted! Thank you!', ephemeral: true });
      }
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied) {
      interaction.reply({ content: '❌ An error occurred!', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);


