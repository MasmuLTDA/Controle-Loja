// admin_logic.js - Lógica para o Painel Administrativo com Estrutura Normalizada

document.addEventListener("DOMContentLoaded", () => {
    // --- Configuração e Inicialização do Firebase ---
    const firebaseConfig = {
        apiKey: "AIzaSyBP7vj2eett5t49PlWRxfGXOOYehkNibik", // Use a API Key correta
        authDomain: "controle-loja-9c606.firebaseapp.com",
        projectId: "controle-loja-9c606",
        storageBucket: "controle-loja-9c606.firebasestorage.app",
        messagingSenderId: "291893265962",
        appId: "1:291893265962:web:3d2405ada394060f40a553",
        databaseURL: "https://controle-loja-9c606-default-rtdb.firebaseio.com"
    };

    // Inicializar Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();
    const atendimentosRef = database.ref("atendimentos");
    const clientesRef = database.ref("clientes");
    const atendentesRef = database.ref("atendentes");

    // --- Variáveis Globais e Caches ---
    let allAttendances = [];
    let clientesCache = {};
    let atendentesCache = {};
    let currentEditingAttendanceId = null;
    let isLoading = true; // Flag para indicar carregamento inicial

    // --- Funções Auxiliares ---
    function formatCurrency(value) {
        if (typeof value !== 'number') {
            value = parseFloat(value) || 0;
        }
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    function getChannelBadge(channel) {
        if (!channel) return "-";
        const lowerChannel = channel.toLowerCase();
        if (lowerChannel.includes('whatsapp')) {
            return '<span class="channel-badge channel-whatsapp">WhatsApp</span>';
        } else if (lowerChannel.includes('instagram')) {
            return '<span class="channel-badge channel-instagram">Instagram</span>';
        } else if (lowerChannel.includes('presencial')) {
            return '<span class="channel-badge channel-presencial">Presencial</span>';
        } else {
            return channel; // Retorna o nome original se não reconhecido
        }
    }

    function formatTimestamp(timestamp) {
        if (!timestamp) return "-";
        try {
            const dateObj = new Date(timestamp);
            if (isNaN(dateObj)) return "Data inválida";
            return dateObj.toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) {
            console.error("Erro ao formatar timestamp:", timestamp, e);
            return "Erro data";
        }
    }

    function getNumericTimestamp(timestamp) {
        if (!timestamp) return 0;
        try {
            const dateObj = new Date(timestamp);
            return isNaN(dateObj) ? 0 : dateObj.getTime();
        } catch (e) {
            return 0;
        }
    }

    // --- Funções de Carregamento de Dados (Firebase) ---

    async function loadInitialData() {
        isLoading = true;
        showLoadingIndicators(); // Mostra "Carregando..." nas tabelas
        try {
            // Carregar atendentes e clientes primeiro para popular caches
            const [atendentesSnapshot, clientesSnapshot] = await Promise.all([
                atendentesRef.once("value"),
                clientesRef.once("value")
            ]);

            atendentesCache = atendentesSnapshot.val() || {};
            clientesCache = clientesSnapshot.val() || {};

            console.log("Atendentes carregados:", Object.keys(atendentesCache).length);
            console.log("Clientes carregados:", Object.keys(clientesCache).length);

            populateAttendantFilters(); // Popula os selects de atendente

            // Configurar listener para atendimentos (atualização em tempo real)
            atendimentosRef.orderByChild("timestamp").on("value", (snapshot) => {
                const attendancesData = snapshot.val() || {};
                allAttendances = Object.keys(attendancesData).map(key => ({
                    id: key,
                    ...attendancesData[key]
                })).sort((a, b) => getNumericTimestamp(b.timestamp) - getNumericTimestamp(a.timestamp)); // Ordena por mais recente

                console.log("Atendimentos carregados/atualizados:", allAttendances.length);
                isLoading = false;
                updateUI(); // Atualiza toda a interface (estatísticas, tabelas)
            }, (error) => {
                console.error("Erro ao carregar atendimentos:", error);
                isLoading = false;
                showErrorIndicators(); // Mostra erro nas tabelas
                alert("Erro ao carregar dados de atendimentos do Firebase.");
            });

        } catch (error) {
            console.error("Erro ao carregar dados iniciais (atendentes/clientes):", error);
            isLoading = false;
            showErrorIndicators();
            alert("Erro ao carregar dados de atendentes ou clientes do Firebase.");
        }
    }

    function showLoadingIndicators() {
        document.querySelectorAll("tbody").forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="${tbody.previousElementSibling.rows[0].cells.length}" style="text-align: center; padding: 20px; color: #888;">Carregando dados...</td></tr>`;
        });
        // Zerar estatísticas enquanto carrega
        updateStats(0, 0, 0, 0);
    }

    function showErrorIndicators() {
        document.querySelectorAll("tbody").forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="${tbody.previousElementSibling.rows[0].cells.length}" style="text-align: center; padding: 20px; color: var(--danger-color);">Erro ao carregar dados. Verifique o console.</td></tr>`;
        });
    }

    // --- Funções de Atualização da Interface ---

    function updateUI() {
        if (isLoading) return; // Não atualiza se ainda estiver carregando
        console.log("Atualizando UI...");
        populateAttendantFilters(); // Garante que filtros de atendente estejam atualizados
        const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab') || 'recent';
        loadDataForTab(activeTab); // Recarrega dados da aba ativa com base nos filtros atuais
        calculateAndDisplayStats(); // Calcula e exibe as estatísticas gerais
    }

    function populateAttendantFilters() {
        const attendantNames = Object.values(atendentesCache)
                                   .map(att => att.nome)
                                   .filter((name, index, self) => name && self.indexOf(name) === index) // Nomes únicos e não vazios
                                   .sort(); // Ordena alfabeticamente

        const selects = document.querySelectorAll('#attendantFilter, #saleAttendantFilter, #paymentAttendantFilter, #attendantAttendantFilter');

        selects.forEach(select => {
            const currentValue = select.value;
            // Limpar opções existentes (exceto a primeira "Todos")
            while (select.options.length > 1) {
                select.remove(1);
            }
            // Adicionar atendentes
            attendantNames.forEach(name => {
                // Encontrar o ID correspondente ao nome (pode haver nomes duplicados, pega o primeiro)
                const attendantId = Object.keys(atendentesCache).find(id => atendentesCache[id].nome === name);
                if (attendantId) {
                    const option = document.createElement('option');
                    option.value = attendantId; // Valor é o ID
                    option.textContent = name; // Texto é o Nome
                    select.appendChild(option);
                }
            });
            // Restaura o valor selecionado (ID), se ainda existir
            if (Object.keys(atendentesCache).includes(currentValue)) {
                select.value = currentValue;
            } else {
                select.value = 'all'; // Volta para 'Todos'
            }
        });
    }

    function calculateAndDisplayStats() {
        let totalClientsCount = 0;
        let totalSalesCount = 0;
        let totalSalesValue = 0;

        // Usa os dados brutos (allAttendances) para estatísticas gerais
        // Poderia usar dados filtrados se as estatísticas devessem refletir os filtros
        const clientIds = new Set();
        allAttendances.forEach(att => {
            if (att.clienteId) {
                clientIds.add(att.clienteId);
            }
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') { // Considera pagamento de compra como venda
                totalSalesCount++;
                totalSalesValue += att.valorTotal || 0;
            }
        });

        totalClientsCount = clientIds.size;
        const averageTicket = totalSalesCount > 0 ? totalSalesValue / totalSalesCount : 0;

        updateStats(totalClientsCount, totalSalesCount, totalSalesValue, averageTicket);
    }

    function updateStats(clients, sales, value, avgTicket) {
        document.getElementById('totalClients').textContent = clients;
        document.getElementById('totalSales').textContent = sales;
        document.getElementById('totalValue').textContent = formatCurrency(value);
        document.getElementById('averageTicket').textContent = formatCurrency(avgTicket);
    }

    // --- Funções de Filtragem e Carregamento por Aba ---

    function applyFilters(data, filterPrefix) {
        // Pega os valores dos filtros da interface
        const period = document.getElementById(`${filterPrefix}PeriodFilter`)?.value || 'all';
        const sector = document.getElementById(`${filterPrefix}SectorFilter`)?.value || 'all';
        const operationType = document.getElementById(`${filterPrefix}OperationTypeFilter`)?.value || 'all';
        const attendantId = document.getElementById(`${filterPrefix}AttendantFilter`)?.value || 'all'; // Agora pega o ID
        const channel = document.getElementById(`${filterPrefix}ChannelFilter`)?.value || 'all';
        const paymentType = document.getElementById(`${filterPrefix}PaymentTypeFilter`)?.value || 'all';
        const paymentMethod = document.getElementById(`${filterPrefix}PaymentMethodFilter`)?.value || 'all';
        const status = document.getElementById(`${filterPrefix}StatusFilter`)?.value || 'all';
        const minValue = parseFloat(document.getElementById(`${filterPrefix}MinValueFilter`)?.value.replace(',', '.')) || 0;
        const maxValue = parseFloat(document.getElementById(`${filterPrefix}MaxValueFilter`)?.value.replace(',', '.')) || Infinity;
        const product = document.getElementById(`${filterPrefix}ProductFilter`)?.value.toLowerCase() || '';
        const clientSearch = document.getElementById(`${filterPrefix}ClientSearchFilter`)?.value.toLowerCase() || '';
        const clientVisits = parseInt(document.getElementById(`${filterPrefix}ClientVisitsFilter`)?.value) || 0;

        // Calcula limites de data
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const todayEnd = todayStart + 24 * 60 * 60 * 1000;
        const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
        const weekAgoStart = todayStart - 7 * 24 * 60 * 60 * 1000;
        const monthAgoStart = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).getTime();

        // Filtra os dados
        return data.filter(item => {
            const itemTimestampMs = getNumericTimestamp(item.timestamp);
            if (itemTimestampMs === 0) return false;

            let periodMatch = true;
            if (period === 'today') periodMatch = itemTimestampMs >= todayStart && itemTimestampMs < todayEnd;
            else if (period === 'yesterday') periodMatch = itemTimestampMs >= yesterdayStart && itemTimestampMs < todayStart;
            else if (period === 'week') periodMatch = itemTimestampMs >= weekAgoStart;
            else if (period === 'month') periodMatch = itemTimestampMs >= monthAgoStart;
            if (!periodMatch) return false;

            if (sector !== 'all' && item.setor !== sector) return false;

            // Filtro Tipo de Operação (usando campo padronizado 'tipoOperacao')
            let operationTypeMatch = true;
            if (operationType !== 'all') {
                if (operationType === 'sale') operationTypeMatch = item.tipoOperacao === 'sale_completed' || item.tipoOperacao === 'payment'; // Venda ou Pagamento de Compra
                else if (operationType === 'payment') operationTypeMatch = item.tipoOperacao.startsWith('payment_booklet'); // Apenas pagamentos de carnê
                else if (operationType === 'exchange') operationTypeMatch = item.tipoOperacao === 'exchange';
                else if (operationType === 'info') operationTypeMatch = item.tipoOperacao === 'information' || item.tipoOperacao.startsWith('installment_query'); // Informação ou Consulta Parcela
                else operationTypeMatch = item.tipoOperacao === operationType; // Caso genérico (se houver outros tipos)
            }
            if (!operationTypeMatch) return false;

            // Filtro Atendente (usando 'atendenteId')
            if (attendantId !== 'all' && item.atendenteId !== attendantId) return false;

            if (channel !== 'all' && item.canal !== channel) return false;

            // Filtro Tipo de Pagamento (Caixa - Aba Recentes)
            const paymentTypeFilterGroup = document.getElementById('paymentTypeFilterGroup');
            if (paymentTypeFilterGroup && paymentTypeFilterGroup.style.display !== 'none' && paymentType !== 'all') {
                if (paymentType === 'purchase_payment' && item.tipoOperacao !== 'payment') return false;
                if (paymentType === 'booklet_payment' && !item.tipoOperacao.startsWith('payment_booklet')) return false;
                if (paymentType === 'installment_query' && !item.tipoOperacao.startsWith('installment_query')) return false;
            }

            // Filtros Avançados
            const itemValue = item.valorTotal || 0;
            if (itemValue < minValue || itemValue > maxValue) return false;

            if (paymentMethod !== 'all' && item.metodoPagamento !== paymentMethod) return false;

            // if (status !== 'all' && item.status !== status) return false; // Implementar se houver campo status

            const itemProductsText = (
                (item.produtosVendidos ? item.produtosVendidos.join(' ') : '') +
                (item.produtosInteresse || '') +
                (item.produtoTrocado || '') +
                (item.produtoNovo || '') +
                (item.produtosAdquiridos ? item.produtosAdquiridos.join(' ') : '')
            ).toLowerCase();
            if (product && !itemProductsText.includes(product)) return false;

            // Filtro Busca Cliente (Nome)
            const clientName = clientesCache[item.clienteId]?.nome || '';
            if (clientSearch && (!clientName || !clientName.toLowerCase().includes(clientSearch))) return false;

            // Filtro Mínimo de Visitas (aplicado depois, na agregação)

            return true;
        });
    }

    function loadRecentAttendances() {
        const tableBody = document.getElementById("recentAttendancesTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "");

        if (filteredAttendances.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhum atendimento encontrado com os filtros aplicados</td></tr>';
            return;
        }

        filteredAttendances.forEach(att => {
            const row = document.createElement("tr");
            const clientName = clientesCache[att.clienteId]?.nome || "Cliente não encontrado";
            const attendantName = atendentesCache[att.atendenteId]?.nome || "Atendente não encontrado";

            row.innerHTML = `
                <td>${formatTimestamp(att.timestamp)}</td>
                <td>${clientName} ${att.clienteId ? '' : '(Não vinculado)'}</td>
                <td>${attendantName}</td>
                <td>${att.setor || "-"}</td>
                <td>${att.tipoOperacao || "-"}</td>
                <td>${getChannelBadge(att.canal)}</td>
                <td>${formatCurrency(att.valorTotal)}</td>
                <td><button class="view-details-btn" data-id="${att.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadClients() {
        const tableBody = document.getElementById("clientsTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "client");
        const clientVisitsFilter = parseInt(document.getElementById("clientVisitsFilter")?.value) || 0;

        const clientMap = new Map();
        filteredAttendances.forEach(att => {
            if (!att.clienteId || !clientesCache[att.clienteId]) return; // Ignora se não tem ID ou cliente não está no cache

            const clientId = att.clienteId;
            if (!clientMap.has(clientId)) {
                clientMap.set(clientId, {
                    id: clientId,
                    name: clientesCache[clientId].nome,
                    contact: clientesCache[clientId].contato || "-",
                    attendances: 0,
                    purchases: 0,
                    totalValue: 0,
                    lastAttendanceTimestamp: 0
                });
            }

            const clientData = clientMap.get(clientId);
            clientData.attendances++;
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') {
                clientData.purchases++;
                clientData.totalValue += att.valorTotal || 0;
            }
            const itemTimestamp = getNumericTimestamp(att.timestamp);
            if (itemTimestamp > clientData.lastAttendanceTimestamp) {
                clientData.lastAttendanceTimestamp = itemTimestamp;
            }
        });

        const clientsData = Array.from(clientMap.values())
                               .filter(client => client.attendances >= clientVisitsFilter) // Aplica filtro de visitas mínimas
                               .sort((a, b) => b.lastAttendanceTimestamp - a.lastAttendanceTimestamp);

        if (clientsData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhum cliente encontrado com os filtros aplicados</td></tr>';
            return;
        }

        clientsData.forEach(client => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${client.name}</td>
                <td>${client.contact}</td>
                <td>${client.attendances}</td>
                <td>${client.purchases}</td>
                <td>${formatCurrency(client.totalValue)}</td>
                <td>${formatTimestamp(client.lastAttendanceTimestamp)}</td>
                <td><button class="view-details-btn" data-client-id="${client.id}">Ver Detalhes</button></td> 
            `; // Botão pode levar a uma visão de cliente
            tableBody.appendChild(row);
        });
        // addClientDetailButtonListeners(); // Implementar se necessário
    }

    function loadSales() {
        const tableBody = document.getElementById("salesTable");
        tableBody.innerHTML = "";
        // Filtra atendimentos que são vendas (sale_completed ou payment)
        const salesData = allAttendances.filter(att => att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment');
        const filteredSales = applyFilters(salesData, "sale");

        if (filteredSales.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Nenhuma venda encontrada com os filtros aplicados</td></tr>';
            return;
        }

        filteredSales.forEach(sale => {
            const row = document.createElement("tr");
            const clientName = clientesCache[sale.clienteId]?.nome || "Cliente não encontrado";
            const attendantName = atendentesCache[sale.atendenteId]?.nome || "Atendente não encontrado";

            row.innerHTML = `
                <td>${formatTimestamp(sale.timestamp)}</td>
                <td>${clientName} ${sale.clienteId ? '' : '(Não vinculado)'}</td>
                <td>${attendantName}</td>
                <td>${sale.setor || "-"}</td>
                <td>${getChannelBadge(sale.canal)}</td>
                <td>${formatCurrency(sale.valorTotal)}</td>
                <td>${sale.metodoPagamento || "-"} ${sale.parcelas > 1 ? `(${sale.parcelas}x)` : ''}</td>
                <td><button class="view-details-btn" data-id="${sale.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadPayments() {
        const tableBody = document.getElementById("paymentsTable");
        tableBody.innerHTML = "";
        // Filtra atendimentos do setor caixa
        const paymentOperations = allAttendances.filter(att => att.setor === 'caixa');
        const filteredPayments = applyFilters(paymentOperations, "payment");

        if (filteredPayments.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhuma operação de caixa encontrada com os filtros aplicados</td></tr>';
            return;
        }

        filteredPayments.forEach(pay => {
            const row = document.createElement("tr");
            const clientName = clientesCache[pay.clienteId]?.nome || "-"; // Cliente pode ser opcional no caixa
            const attendantName = atendentesCache[pay.atendenteId]?.nome || "Operador não encontrado";

            row.innerHTML = `
                <td>${formatTimestamp(pay.timestamp)}</td>
                <td>${clientName}</td>
                <td>${attendantName}</td>
                <td>${pay.tipoOperacao || "-"}</td>
                <td>${formatCurrency(pay.valorTotal)}</td>
                <td>${pay.metodoPagamento || "-"} ${pay.parcelas > 1 ? `(${pay.parcelas}x)` : ''}</td>
                <td><button class="view-details-btn" data-id="${pay.id}">Ver Detalhes</button></td>
            `;
            tableBody.appendChild(row);
        });
        addDetailButtonListeners();
    }

    function loadAttendants() {
        const tableBody = document.getElementById("attendantsTable");
        tableBody.innerHTML = "";
        const filteredAttendances = applyFilters(allAttendances, "attendant");

        const attendantMap = new Map();
        filteredAttendances.forEach(att => {
            if (!att.atendenteId || !atendentesCache[att.atendenteId]) return;

            const attendantId = att.atendenteId;
            if (!attendantMap.has(attendantId)) {
                attendantMap.set(attendantId, {
                    id: attendantId,
                    name: atendentesCache[attendantId].nome,
                    sector: atendentesCache[attendantId].setorPrincipal || "-",
                    attendances: 0,
                    sales: 0,
                    totalValue: 0,
                    lastAttendanceTimestamp: 0
                });
            }

            const attendantData = attendantMap.get(attendantId);
            attendantData.attendances++;
            if (att.tipoOperacao === 'sale_completed' || att.tipoOperacao === 'payment') {
                attendantData.sales++;
                attendantData.totalValue += att.valorTotal || 0;
            }
            const itemTimestamp = getNumericTimestamp(att.timestamp);
            if (itemTimestamp > attendantData.lastAttendanceTimestamp) {
                attendantData.lastAttendanceTimestamp = itemTimestamp;
            }
        });

        const attendantsData = Array.from(attendantMap.values())
                                  .sort((a, b) => b.lastAttendanceTimestamp - a.lastAttendanceTimestamp);

        if (attendantsData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;">Nenhum atendente encontrado com os filtros aplicados</td></tr>';
            return;
        }

        attendantsData.forEach(att => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${att.name}</td>
                <td>${att.sector}</td>
                <td>${att.attendances}</td>
                <td>${att.sales}</td>
                <td>${formatCurrency(att.totalValue)}</td>
                <td>${formatTimestamp(att.lastAttendanceTimestamp)}</td>
                
            `; //<td><button class="view-details-btn" data-attendant-id="${att.id}">Ver Detalhes</button></td>
            tableBody.appendChild(row);
        });
        // addAttendantDetailButtonListeners(); // Implementar se necessário
    }

    function loadDataForTab(tabId) {
        console.log(`Carregando dados para aba: ${tabId}`);
        if (isLoading) {
            console.log("Ainda carregando dados iniciais, aguardando...");
            showLoadingIndicators();
            return;
        }
        if (tabId === 'recent') loadRecentAttendances();
        else if (tabId === 'clients') loadClients();
        else if (tabId === 'sales') loadSales();
        else if (tabId === 'payments') loadPayments();
        else if (tabId === 'attendants') loadAttendants();
    }

    // --- Funções do Modal de Detalhes/Edição ---

    function addDetailButtonListeners() {
        document.querySelectorAll('.view-details-btn').forEach(button => {
            // Remove listener antigo para evitar duplicação
            button.replaceWith(button.cloneNode(true));
        });
        document.querySelectorAll('.view-details-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                const id = event.target.getAttribute('data-id');
                if (id) {
                    showDetailsModal(id);
                }
                // Adicionar lógica para data-client-id e data-attendant-id se necessário
            });
        });
    }

    function showDetailsModal(attendanceId) {
        currentEditingAttendanceId = attendanceId;
        const attendance = allAttendances.find(att => att.id === attendanceId);
        if (!attendance) {
            alert("Atendimento não encontrado!");
            return;
        }

        const modal = document.getElementById("detailsModal");
        const detailsContent = document.getElementById("detailsContent");
        detailsContent.innerHTML = ""; // Limpar conteúdo anterior

        const clientName = clientesCache[attendance.clienteId]?.nome || "(Não vinculado)";
        const attendantName = atendentesCache[attendance.atendenteId]?.nome || "(Não encontrado)";

        // Mapeamento de chaves para labels e tipos de input
        const fieldConfig = {
            id: { label: "ID Atendimento", type: "text", readonly: true },
            timestamp: { label: "Data/Hora", type: "datetime-local" },
            clienteId: { label: "Cliente", type: "text", readonly: true, displayValue: clientName },
            atendenteId: { label: "Atendente", type: "select", options: atendentesCache },
            setor: { label: "Setor", type: "select", options: { "loja_fisica": "Loja Física", "social_media": "Social Media", "caixa": "Caixa" } },
            canal: { label: "Canal", type: "select", options: { "presencial": "Presencial", "whatsapp": "WhatsApp", "instagram": "Instagram" } },
            tipoOperacao: { label: "Tipo Operação", type: "select", options: {
                "sale_completed": "Venda Concluída",
                "payment": "Pagamento de Compra",
                "information": "Informação",
                "sale_not_completed": "Venda Não Concluída",
                "exchange": "Troca",
                "fitting": "Prova",
                "installment_query_whatsapp": "Consulta Parcela (Whats)",
                "installment_query_store": "Consulta Parcela (Loja)",
                "payment_booklet_whatsapp": "Pagamento Carnê (Whats)",
                "payment_booklet_store": "Pagamento Carnê (Loja)"
            } },
            valorTotal: { label: "Valor Total (R$)", type: "number", step: "0.01" },
            metodoPagamento: { label: "Forma Pagamento", type: "select", options: { "": "N/A", "cash": "Dinheiro", "credit": "Crédito", "debit": "Débito", "pix": "PIX", "transfer": "Transferência", "other": "Outro" } },
            parcelas: { label: "Parcelas", type: "number", step: "1" },
            produtosVendidos: { label: "Produtos Vendidos", type: "textarea" },
            produtosAdquiridos: { label: "Produtos Adquiridos (Caixa)", type: "textarea" },
            produtosInteresse: { label: "Produtos de Interesse", type: "text" },
            produtoTrocado: { label: "Produto Trocado (Original)", type: "text" },
            produtoNovo: { label: "Produto Novo (Troca)", type: "text" },
            tamanhoOriginal: { label: "Tamanho Original (Troca)", type: "text" },
            tamanhoNovo: { label: "Tamanho Novo (Troca)", type: "text" },
            valorProdutosAdicionais: { label: "Valor Produtos Adicionais (Troca, R$)", type: "number", step: "0.01" },
            valorProdutoAntigo: { label: "Valor Produto Antigo (Troca, R$)", type: "number", step: "0.01" },
            valorProdutoNovo: { label: "Valor Produto Novo (Troca, R$)", type: "number", step: "0.01" },
            valorPago: { label: "Valor Pago (Carnê, R$)", type: "number", step: "0.01" },
            valorVendaAdicional: { label: "Valor Venda Adicional (Caixa, R$)", type: "number", step: "0.01" },
            motivoNaoVenda: { label: "Motivo Não Venda", type: "text" },
            motivoNaoOferta: { label: "Motivo Não Oferta (Caixa)", type: "text" },
            motivoNaoVendaAdicional: { label: "Motivo Não Venda Adicional (Caixa)", type: "text" },
            descontoAplicado: { label: "Desconto Aplicado (Caixa)", type: "text" },
            observacoes: { label: "Observações", type: "textarea" }
            // Adicionar outros campos conforme necessário
        };

        let detailsHTML = `<input type="hidden" id="editAttendanceId" value="${attendanceId}">`;

        for (const key in fieldConfig) {
            if (attendance.hasOwnProperty(key) || key === 'clienteId' || key === 'id') { // Inclui campos mesmo que vazios se configurados
                const config = fieldConfig[key];
                let currentValue = key === 'id' ? attendanceId : attendance[key];
                if (key === 'clienteId') currentValue = clientName; // Usa o nome para exibição
                if (key === 'produtosVendidos' || key === 'produtosAdquiridos') {
                    currentValue = Array.isArray(currentValue) ? currentValue.join('\n') : currentValue;
                }
                currentValue = currentValue ?? ""; // Garante que não seja undefined/null

                detailsHTML += `<div class="detail-row">
                                  <label class="detail-label" for="edit_${key}">${config.label}:</label>
                                  <div class="detail-value">`;

                if (config.readonly) {
                    detailsHTML += `<span id="edit_${key}">${config.displayValue !== undefined ? config.displayValue : currentValue}</span>`;
                } else if (config.type === "textarea") {
                    detailsHTML += `<textarea id="edit_${key}" name="${key}" rows="3">${currentValue}</textarea>`;
                } else if (config.type === "select") {
                    detailsHTML += `<select id="edit_${key}" name="${key}">`;
                    if (key === 'atendenteId') {
                        // Popula com atendentes do cache
                        detailsHTML += `<option value="">Selecione...</option>`;
                        for (const id in config.options) {
                            const selected = id === attendance[key] ? " selected" : "";
                            detailsHTML += `<option value="${id}"${selected}>${config.options[id].nome}</option>`;
                        }
                    } else {
                        // Popula com opções fixas
                        if (config.options[""] === undefined) { // Adiciona opção vazia se não existir
                             detailsHTML += `<option value="">Selecione...</option>`;
                        }
                        for (const optValue in config.options) {
                            const selected = optValue === currentValue ? " selected" : "";
                            detailsHTML += `<option value="${optValue}"${selected}>${config.options[optValue]}</option>`;
                        }
                    }
                    detailsHTML += `</select>`;
                } else if (config.type === "datetime-local") {
                    let formattedDate = "";
                    try {
                        const dateObj = new Date(attendance.timestamp); // Usa o timestamp original
                        if (!isNaN(dateObj)) {
                            const year = dateObj.getFullYear();
                            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                            const day = dateObj.getDate().toString().padStart(2, '0');
                            const hours = dateObj.getHours().toString().padStart(2, '0');
                            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
                            formattedDate = `${year}-${month}-${day}T${hours}:${minutes}`;
                        }
                    } catch (e) { console.error("Erro ao formatar timestamp para edição:", e); }
                    detailsHTML += `<input type="datetime-local" id="edit_${key}" name="${key}" value="${formattedDate}">`;
                } else {
                    const stepAttr = config.step ? ` step="${config.step}"` : "";
                    const minAttr = config.min !== undefined ? ` min="${config.min}"` : "";
                    detailsHTML += `<input type="${config.type}" id="edit_${key}" name="${key}" value="${currentValue}"${stepAttr}${minAttr}>`;
                }
                detailsHTML += `</div></div>`;
            }
        }

        detailsContent.innerHTML = detailsHTML;
        modal.style.display = "block";
    }

    function closeModal() {
        const modal = document.getElementById("detailsModal");
        modal.style.display = "none";
        document.getElementById("detailsContent").innerHTML = "";
        currentEditingAttendanceId = null;
    }

    function saveEditForm(event) {
        event.preventDefault();
        if (!currentEditingAttendanceId) return;

        const form = event.target;
        const updatedData = {};
        const formData = new FormData(form);

        formData.forEach((value, key) => {
            if (key === 'timestamp' && value) {
                try {
                    const dateObj = new Date(value);
                    updatedData[key] = isNaN(dateObj) ? value : dateObj.toISOString();
                } catch (e) { updatedData[key] = value; }
            } else if (key === 'valorTotal' || key === 'valorProdutosAdicionais' || key === 'valorProdutoAntigo' || key === 'valorProdutoNovo' || key === 'valorPago' || key === 'valorVendaAdicional') {
                updatedData[key] = parseFloat(value) || 0;
            } else if (key === 'parcelas') {
                updatedData[key] = parseInt(value) || 1;
            } else if (key === 'produtosVendidos' || key === 'produtosAdquiridos') {
                updatedData[key] = value.split('\n').map(s => s.trim()).filter(s => s); // Salva como array
            } else {
                updatedData[key] = value;
            }
        });

        console.log("Salvando alterações para o ID:", currentEditingAttendanceId, updatedData);

        atendimentosRef.child(currentEditingAttendanceId).update(updatedData)
            .then(() => {
                console.log("Dados atualizados com sucesso!");
                closeModal();
                alert("Atendimento atualizado com sucesso!");
                // UI será atualizada pelo listener 'on("value")'
            })
            .catch((error) => {
                console.error("Erro ao atualizar dados:", error);
                alert("Erro ao salvar alterações: " + error.message);
            });
    }

    // --- Configuração de Event Listeners ---

    function setupEventListeners() {
        // Abas
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', function() {
                const tabId = this.getAttribute('data-tab');
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                this.classList.add('active');
                document.getElementById(`${tabId}-tab`).classList.add('active');
                loadDataForTab(tabId);
            });
        });

        // Botões Limpar/Aplicar Filtros
        const filterButtonsConfig = [
            { prefix: 'recent', clearId: 'clearFilters', applyId: 'applyFilters' },
            { prefix: 'clients', clearId: 'clearClientFilters', applyId: 'applyClientFilters' },
            { prefix: 'sales', clearId: 'clearSaleFilters', applyId: 'applySaleFilters' },
            { prefix: 'payments', clearId: 'clearPaymentFilters', applyId: 'applyPaymentFilters' },
            { prefix: 'attendants', clearId: 'clearAttendantFilters', applyId: 'applyAttendantFilters' }
        ];

        filterButtonsConfig.forEach(config => {
            const clearBtn = document.getElementById(config.clearId);
            const applyBtn = document.getElementById(config.applyId);
            const tabPrefix = config.prefix === 'recent' ? '' : config.prefix; // Ajusta prefixo para filtros

            if (clearBtn) clearBtn.addEventListener('click', () => clearFiltersForTab(tabPrefix));
            if (applyBtn) applyBtn.addEventListener('click', () => applyFiltersForTab(config.prefix)); // Usa prefixo da aba aqui
        });

        // Modal
        document.getElementById("closeModal")?.addEventListener("click", closeModal);
        document.getElementById("cancelEdit")?.addEventListener("click", closeModal);
        document.getElementById("editForm")?.addEventListener("submit", saveEditForm);
        window.addEventListener("click", function(event) {
            const modal = document.getElementById("detailsModal");
            if (event.target == modal) closeModal();
        });

        // Filtros Avançados Toggles
        setupAdvancedFiltersToggle('toggleAdvancedFilters', 'advancedFilters');
        setupAdvancedFiltersToggle('toggleClientAdvancedFilters', 'clientAdvancedFilters');
        setupAdvancedFiltersToggle('toggleSaleAdvancedFilters', 'saleAdvancedFilters');

        // Filtro dinâmico de Tipo de Pagamento (Aba Recentes)
        document.getElementById('sectorFilter')?.addEventListener('change', function() {
            const paymentTypeFilterGroup = document.getElementById('paymentTypeFilterGroup');
            if (!paymentTypeFilterGroup) return;
            const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab');
            if (activeTab === 'recent' && this.value === 'caixa') {
                paymentTypeFilterGroup.style.display = 'flex';
            } else {
                paymentTypeFilterGroup.style.display = 'none';
            }
        });

        // Exportar Dados (Placeholder)
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                alert('Funcionalidade de exportação ainda não implementada.');
                // TODO: Implementar exportação CSV/Excel dos dados filtrados da aba atual
            });
        });
    }

    function clearFiltersForTab(tabPrefix) {
        const filterContainer = document.querySelector(`#${tabPrefix || 'recent'}-tab .filters`); // Usa 'recent' se prefixo vazio
        if (!filterContainer) return;

        filterContainer.querySelectorAll('select, input').forEach(el => {
            if (el.tagName === 'SELECT') {
                const allOption = el.querySelector('option[value="all"]');
                el.value = allOption ? 'all' : (el.options.length > 0 ? el.options[0].value : '');
            } else {
                el.value = '';
            }
        });
        const advancedFilters = filterContainer.querySelector('.advanced-filters');
        if (advancedFilters) advancedFilters.classList.remove('show');
        const toggle = filterContainer.querySelector('.advanced-filters-toggle');
        if (toggle) toggle.textContent = 'Mostrar filtros avançados';

        const paymentTypeGroup = filterContainer.querySelector('#paymentTypeFilterGroup');
        if (paymentTypeGroup) paymentTypeGroup.style.display = 'none'; // Sempre esconde ao limpar

        const activeTab = document.querySelector('.tab.active')?.getAttribute('data-tab') || 'recent';
        loadDataForTab(activeTab);
    }

    function applyFiltersForTab(tabId) {
        console.log(`Aplicando filtros da aba ${tabId}...`);
        loadDataForTab(tabId);
    }

    function setupAdvancedFiltersToggle(toggleId, filtersId) {
        const toggleButton = document.getElementById(toggleId);
        const advancedFilters = document.getElementById(filtersId);
        if (toggleButton && advancedFilters) {
            toggleButton.addEventListener('click', function() {
                const isShown = advancedFilters.classList.toggle('show');
                this.textContent = isShown ? 'Ocultar filtros avançados' : 'Mostrar filtros avançados';
            });
        }
    }

    // --- Inicialização ---
    setupEventListeners();
    loadInitialData(); // Carrega dados iniciais e configura listener

}); // Fim do DOMContentLoaded

